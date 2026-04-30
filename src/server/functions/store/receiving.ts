import { createServerFn } from "@tanstack/react-start"
import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  storeReceivings,
  storeStock,
  supplyRoutes,
  supplyRouteItems,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { validateReceiveItem } from "./receive-validate"

/**
 * List supply routes that have status "in_transit" or "received" —
 * i.e. routes whose items can be received at the store.
 */
export const listReceivableRoutes = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  return db.query.supplyRoutes.findMany({
    where: (r, { inArray }) => inArray(r.status, ["in_transit", "received"]),
    with: {
      items: { with: { supplier: true } },
      suppliers: { with: { supplier: true } },
    },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  })
})

/**
 * Get items for a route that haven't been fully received yet.
 */
export const getUnreceivedItems = createServerFn()
  .inputValidator(z.object({ supplyRouteId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const items = await db.query.supplyRouteItems.findMany({
      where: eq(supplyRouteItems.supplyRouteId, data.supplyRouteId),
      with: { supplier: true },
    })

    // Get existing receivings for these items
    const receivedMap = new Map<string, number>()
    if (items.length > 0) {
      const receivings = await db
        .select({
          supplyRouteItemId: storeReceivings.supplyRouteItemId,
          totalReceived: sql<number>`sum(${storeReceivings.quantityReceived})`,
        })
        .from(storeReceivings)
        .where(
          sql`${storeReceivings.supplyRouteItemId} IN (${sql.join(
            items.map((i) => sql`${i.id}`),
            sql`, `,
          )})`,
        )
        .groupBy(storeReceivings.supplyRouteItemId)

      for (const r of receivings) {
        receivedMap.set(r.supplyRouteItemId, Number(r.totalReceived))
      }
    }

    return items.map((item) => ({
      ...item,
      alreadyReceived: receivedMap.get(item.id) ?? 0,
      remaining: item.quantity - (receivedMap.get(item.id) ?? 0),
    }))
  })

const receiveItemInput = z.object({
  supplyRouteItemId: z.string().uuid(),
  quantityReceived: z.number().int().min(0),
  quantityDamaged: z.number().int().min(0).default(0),
  discrepancyNotes: z.string().optional(),
})

const receiveGoodsInput = z.object({
  supplyRouteId: z.string().uuid(),
  items: z.array(receiveItemInput).min(1),
})

/**
 * Receive goods from a supply route into the store.
 *
 * For each item:
 * 1. Creates a StoreReceiving record (transit loss = expected - received)
 * 2. Creates or updates StoreStock
 * 3. Posts ledger: DR Inventory-Store / CR Cash (for the received amount)
 * 4. If transit loss detected, posts: DR Inventory Loss / CR Inventory-Store
 */
export const receiveGoods = createServerFn()
  .inputValidator(receiveGoodsInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const results: Array<{
        itemId: string
        productName: string
        expected: number
        received: number
        damaged: number
        transitLoss: number
      }> = []

      for (const item of data.items) {
        // Get the supply route item
        const sri = await tx.query.supplyRouteItems.findFirst({
          where: eq(supplyRouteItems.id, item.supplyRouteItemId),
        })
        if (!sri) throw new Error(`Supply route item not found: ${item.supplyRouteItemId}`)

        const { usableQty } = validateReceiveItem({
          quantityReceived: item.quantityReceived,
          quantityDamaged: item.quantityDamaged,
        })
        const transitLoss = sri.quantity - item.quantityReceived

        // 1. Create StoreReceiving record
        await tx.insert(storeReceivings).values({
          storeId: store.id,
          supplyRouteItemId: sri.id,
          receivedDate: new Date(),
          quantityExpected: sri.quantity,
          quantityReceived: item.quantityReceived,
          quantityDamaged: item.quantityDamaged,
          discrepancyNotes: item.discrepancyNotes,
          receivedBy: (session.user as { id: string }).id,
        })

        // 2. Create or update StoreStock
        if (sri.quantity <= 0) throw new Error("Invalid supply route item quantity")
        const costPerUnit = new BigNumber(sri.totalCostUgx)
          .div(sri.quantity)
          .dp(2, BigNumber.ROUND_HALF_UP)

        const existing = await tx.query.storeStock.findFirst({
          where: and(
            eq(storeStock.storeId, store.id),
            eq(storeStock.supplyRouteItemId, sri.id),
          ),
        })

        if (existing) {
          await tx
            .update(storeStock)
            .set({
              quantityOnHand: sql`${storeStock.quantityOnHand} + ${usableQty}`,
            })
            .where(eq(storeStock.id, existing.id))
        } else {
          await tx.insert(storeStock).values({
            storeId: store.id,
            productName: sri.productName,
            articleNumber: sri.articleNumber,
            supplyRouteItemId: sri.id,
            quantityOnHand: usableQty,
            costPerUnitUgx: costPerUnit.toFixed(2),
            minimumSellPriceUgx: costPerUnit.toFixed(2), // default; admin sets real price later
          })
        }

        // 3. Post ledger entry for received goods
        const receivedValue = costPerUnit.times(usableQty)
        if (receivedValue.gt(0)) {
          await postJournalEntry(tx, {
            entries: [
              { type: "debit", category: "Inventory - Store", amount: receivedValue.toFixed(2) },
              { type: "credit", category: "Cash", amount: receivedValue.toFixed(2) },
            ],
            referenceType: "store_receiving",
            referenceId: sri.id,
            locationType: "store",
            locationId: store.id,
            depositLocation: "cash",
            recordedBy: (session.user as { id: string }).id,
            description: `Received ${usableQty}x ${sri.productName} from route`,
          })
        }

        // 4. If transit loss, post loss entry
        if (transitLoss > 0) {
          const lossValue = costPerUnit.times(transitLoss)
          await postJournalEntry(tx, {
            entries: [
              { type: "debit", category: "Inventory Loss", amount: lossValue.toFixed(2) },
              { type: "credit", category: "Inventory - Store", amount: lossValue.toFixed(2) },
            ],
            referenceType: "transit_loss",
            referenceId: sri.id,
            locationType: "store",
            locationId: store.id,
            recordedBy: (session.user as { id: string }).id,
            description: `Transit loss: ${transitLoss}x ${sri.productName}`,
          })
        }

        results.push({
          itemId: sri.id,
          productName: sri.productName,
          expected: sri.quantity,
          received: item.quantityReceived,
          damaged: item.quantityDamaged,
          transitLoss,
        })
      }

      // Update route status to "received" if not already
      await tx
        .update(supplyRoutes)
        .set({ status: "received" })
        .where(eq(supplyRoutes.id, data.supplyRouteId))

      return results
    })
  })

/**
 * Get current store stock with quantities and values.
 */
export const getStoreStock = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const store = await db.query.stores.findFirst()
  if (!store) return []

  return db.query.storeStock.findMany({
    where: eq(storeStock.storeId, store.id),
    orderBy: (s, { asc }) => [asc(s.productName)],
  })
})

const setMinPriceInput = z.object({
  storeStockId: z.string().uuid(),
  minimumSellPriceUgx: z.string(),
})

export const setMinimumSellPrice = createServerFn()
  .inputValidator(setMinPriceInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const updated = (await db
      .update(storeStock)
      .set({ minimumSellPriceUgx: data.minimumSellPriceUgx })
      .where(eq(storeStock.id, data.storeStockId))
      .returning()).at(0)

    if (!updated) throw new Error("Stock item not found")
    return updated
  })
