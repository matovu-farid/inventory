import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { stockTakes, stockTakeItems, storeStock, shopStock } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listStockTakes = createServerFn()
  .inputValidator(
    z.object({
      locationType: z.enum(["store", "shop"]),
      locationId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    return db.query.stockTakes.findMany({
      where: (st, { and, eq: e }) =>
        and(
          e(st.locationType, data.locationType),
          e(st.locationId, data.locationId),
        ),
      with: { items: true },
      orderBy: (st, { desc }) => [desc(st.stockTakeDate)],
    })
  })

const startStockTakeInput = z.object({
  locationType: z.enum(["store", "shop"]),
  locationId: z.string().uuid(),
})

/**
 * Start a stock take: creates the stock take record and pre-populates
 * items with current system quantities.
 */
export const startStockTake = createServerFn()
  .inputValidator(startStockTakeInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      const [st] = await tx
        .insert(stockTakes)
        .values({
          locationType: data.locationType,
          locationId: data.locationId,
          stockTakeDate: new Date(),
          conductedBy: userId,
        })
        .returning()

      let itemCount = 0
      // Get current stock for this location
      if (data.locationType === "store") {
        const items = await tx.query.storeStock.findMany({
          where: eq(storeStock.storeId, data.locationId),
        })
        for (const item of items) {
          await tx.insert(stockTakeItems).values({
            stockTakeId: st.id,
            storeStockId: item.id,
            productName: item.productName,
            systemQuantity: item.quantityOnHand,
            physicalQuantity: item.quantityOnHand, // default to matching
            discrepancy: 0,
          })
          itemCount++
        }
      } else {
        const items = await tx.query.shopStock.findMany({
          where: eq(shopStock.shopId, data.locationId),
        })
        for (const item of items) {
          await tx.insert(stockTakeItems).values({
            stockTakeId: st.id,
            shopStockId: item.id,
            productName: item.productName,
            systemQuantity: item.quantityOnHand,
            physicalQuantity: item.quantityOnHand,
            discrepancy: 0,
          })
          itemCount++
        }
      }

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "stockTake.start",
        entityType: "stock_take",
        entityId: st.id,
        after: {
          locationType: data.locationType,
          locationId: data.locationId,
          status: st.status,
        },
        metadata: {
          itemCount,
        },
      })

      return st
    })
  })

const recordCountInput = z.object({
  stockTakeItemId: z.string().uuid(),
  physicalQuantity: z.number().int().min(0),
  notes: z.string().optional(),
})

export const recordPhysicalCount = createServerFn()
  .inputValidator(recordCountInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const item = await db.query.stockTakeItems.findFirst({
      where: eq(stockTakeItems.id, data.stockTakeItemId),
    })
    if (!item) throw new Error("Stock take item not found")

    const discrepancy = data.physicalQuantity - item.systemQuantity

    const [updated] = await db
      .update(stockTakeItems)
      .set({
        physicalQuantity: data.physicalQuantity,
        discrepancy,
        notes: data.notes,
      })
      .where(eq(stockTakeItems.id, data.stockTakeItemId))
      .returning()

    return updated
  })

const reconcileInput = z.object({ stockTakeId: z.string().uuid() })

/**
 * Reconcile a stock take: adjust system quantities to physical counts
 * and post ledger entries for losses.
 */
export const reconcileStockTake = createServerFn()
  .inputValidator(reconcileInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      const st = await tx.query.stockTakes.findFirst({
        where: eq(stockTakes.id, data.stockTakeId),
        with: { items: true },
      })
      if (!st) throw new Error("Stock take not found")
      if (st.status === "reconciled") throw new Error("Already reconciled")

      for (const item of st.items) {
        if (item.discrepancy === 0) continue

        // Adjust system quantity
        if (st.locationType === "store" && item.storeStockId) {
          const stock = await tx.query.storeStock.findFirst({
            where: eq(storeStock.id, item.storeStockId),
          })
          if (stock) {
            await tx
              .update(storeStock)
              .set({ quantityOnHand: item.physicalQuantity })
              .where(eq(storeStock.id, item.storeStockId))

            // Post loss entry if shrinkage
            if (item.discrepancy < 0) {
              const lossQty = Math.abs(item.discrepancy)
              const lossValue = new BigNumber(stock.costPerUnitUgx).times(lossQty)
              await postJournalEntry(tx, {
                entries: [
                  { type: "debit", category: "Inventory Loss", amount: lossValue.toFixed(2) },
                  { type: "credit", category: "Inventory - Store", amount: lossValue.toFixed(2) },
                ],
                referenceType: "stock_take_adjustment",
                referenceId: st.id,
                locationType: "store",
                locationId: st.locationId,
                recordedBy: userId,
                description: `Shrinkage: ${lossQty}x ${item.productName}`,
              })
            }
          }
        } else if (st.locationType === "shop" && item.shopStockId) {
          const stock = await tx.query.shopStock.findFirst({
            where: eq(shopStock.id, item.shopStockId),
          })
          if (stock) {
            await tx
              .update(shopStock)
              .set({ quantityOnHand: item.physicalQuantity })
              .where(eq(shopStock.id, item.shopStockId))

            if (item.discrepancy < 0) {
              const lossQty = Math.abs(item.discrepancy)
              const lossValue = new BigNumber(stock.costPerUnitUgx).times(lossQty)
              await postJournalEntry(tx, {
                entries: [
                  { type: "debit", category: "Inventory Loss", amount: lossValue.toFixed(2) },
                  { type: "credit", category: "Inventory - Shop", amount: lossValue.toFixed(2) },
                ],
                referenceType: "stock_take_adjustment",
                referenceId: st.id,
                locationType: "shop",
                locationId: st.locationId,
                recordedBy: userId,
                description: `Shrinkage: ${lossQty}x ${item.productName}`,
              })
            }
          }
        }
      }

      // Mark stock take as reconciled
      await tx
        .update(stockTakes)
        .set({ status: "reconciled" })
        .where(eq(stockTakes.id, data.stockTakeId))

      const discrepancyCount = st.items.filter((i) => i.discrepancy !== 0).length
      const totalShrinkage = st.items.reduce(
        (sum, i) => sum + (i.discrepancy < 0 ? Math.abs(i.discrepancy) : 0),
        0,
      )
      const totalOverage = st.items.reduce(
        (sum, i) => sum + (i.discrepancy > 0 ? i.discrepancy : 0),
        0,
      )

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "stockTake.reconcile",
        entityType: "stock_take",
        entityId: st.id,
        before: { status: st.status },
        after: { status: "reconciled" },
        metadata: {
          locationType: st.locationType,
          locationId: st.locationId,
          itemCount: st.items.length,
          discrepancyCount,
          totalShrinkage,
          totalOverage,
        },
      })

      return { reconciled: true }
    })
  })
