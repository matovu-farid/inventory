import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
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
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatProductLabel } from "#/lib/products"
import {
  validateDiscrepancyNotes,
  validateQuantityReceived,
} from "./receive-validate"
import { filterRoutesWithUnreceivedItems } from "./receiving-internals"

/**
 * List supply routes that still have items waiting to be received at the
 * store. A route is "receivable" when its status is "in_transit" or
 * "received" AND at least one of its items has no StoreReceiving record yet.
 */
export const listReceivableRoutes = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])

  const routes = await db.query.supplyRoutes.findMany({
    where: (r, { inArray }) => inArray(r.status, ["in_transit", "received"]),
    with: {
      items: {
        with: {
          supplier: true,
          productColor: { with: { product: true } },
        },
      },
      suppliers: { with: { supplier: true } },
    },
    orderBy: (r, { desc }) => [desc(r.createdAt)],
  })

  if (routes.length === 0) return []

  const allItemIds = routes.flatMap((r) => r.items.map((it) => it.id))
  if (allItemIds.length === 0) return []

  const receivedRows = await db
    .select({ supplyRouteItemId: storeReceivings.supplyRouteItemId })
    .from(storeReceivings)
    .where(
      sql`${storeReceivings.supplyRouteItemId} IN (${sql.join(
        allItemIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )

  const receivedItemIds = new Set(receivedRows.map((r) => r.supplyRouteItemId))
  return filterRoutesWithUnreceivedItems(routes, receivedItemIds)
})

/**
 * Get route items that have not yet been received.
 * Each item has at most one StoreReceiving row — once received, it disappears.
 */
export const getUnreceivedItems = createServerFn()
  .inputValidator(z.object({ supplyRouteId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const items = await db.query.supplyRouteItems.findMany({
      where: eq(supplyRouteItems.supplyRouteId, data.supplyRouteId),
      with: {
        supplier: true,
        productColor: { with: { product: true } },
      },
    })

    if (items.length === 0) return []

    const receivedIds = new Set(
      (
        await db
          .select({ supplyRouteItemId: storeReceivings.supplyRouteItemId })
          .from(storeReceivings)
          .where(
            sql`${storeReceivings.supplyRouteItemId} IN (${sql.join(
              items.map((i) => sql`${i.id}`),
              sql`, `,
            )})`,
          )
      ).map((r) => r.supplyRouteItemId),
    )

    return items.filter((item) => !receivedIds.has(item.id))
  })

const receiveItemInput = z.object({
  supplyRouteItemId: z.uuid(),
  quantityReceived: z.number().int().min(0),
  discrepancyNotes: z.string().optional(),
})

const receiveGoodsInput = z.object({
  supplyRouteId: z.uuid(),
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
    requireRole(session, ["admin"])

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const results: Array<{
        itemId: string
        productLabel: string
        expected: number
        received: number
        transitLoss: number
      }> = []

      for (const item of data.items) {
        // Get the supply route item with product chain for log strings
        const sri = await tx.query.supplyRouteItems.findFirst({
          where: eq(supplyRouteItems.id, item.supplyRouteItemId),
          with: { productColor: { with: { product: true } } },
        })
        if (!sri) throw new Error(`Supply route item not found: ${item.supplyRouteItemId}`)

        // Receiving requires a fully-resolved variant. Aggregate/color-only
        // procurement rows (Task 1) must be split into color+size variants
        // by an admin before they can land in store stock.
        const productColor = sri.productColor
        const sriSize = sri.size
        const sriProductColorId = sri.productColorId
        if (!productColor || !sriSize || !sriProductColorId) {
          throw new Error(
            `Item ${sri.id} is missing color or size — split it into full variants before receiving`,
          )
        }

        const productLabel = formatProductLabel(
          productColor.product.articleNumber,
          productColor.colorName,
          sriSize,
        )

        // One receipt per item — refuse if already received
        const prior = await tx.query.storeReceivings.findFirst({
          where: eq(storeReceivings.supplyRouteItemId, sri.id),
        })
        if (prior) {
          throw new Error(
            `${productLabel} has already been received on this route`,
          )
        }

        validateQuantityReceived(item.quantityReceived)
        validateDiscrepancyNotes({
          quantityExpected: sri.quantity,
          quantityReceived: item.quantityReceived,
          discrepancyNotes: item.discrepancyNotes,
        })
        const transitLoss = sri.quantity - item.quantityReceived

        // 1. Create StoreReceiving record
        await tx.insert(storeReceivings).values({
          storeId: store.id,
          supplyRouteItemId: sri.id,
          receivedDate: new Date(),
          quantityExpected: sri.quantity,
          quantityReceived: item.quantityReceived,
          discrepancyNotes: item.discrepancyNotes,
          receivedBy: session.user.id,
        })

        // 2. Upsert StoreStock — merge into existing (storeId, productColorId, size) row
        if (sri.quantity <= 0) throw new Error("Invalid supply route item quantity")
        const costPerUnit = new BigNumber(sri.totalCostUgx)
          .div(sri.quantity)
          .dp(2, BigNumber.ROUND_HALF_UP)

        if (item.quantityReceived > 0) {
          await tx
            .insert(storeStock)
            .values({
              storeId: store.id,
              productColorId: sriProductColorId,
              size: sriSize,
              supplyRouteItemId: sri.id,
              quantityOnHand: item.quantityReceived,
              costPerUnitUgx: costPerUnit.toFixed(2),
              minimumSellPriceUgx: costPerUnit.toFixed(2), // default; admin sets real price later
            })
            .onConflictDoUpdate({
              target: [storeStock.storeId, storeStock.productColorId, storeStock.size],
              set: {
                quantityOnHand: sql`${storeStock.quantityOnHand} + ${item.quantityReceived}`,
              },
            })
        }

        // 3. Post ledger entry for received goods
        const receivedValue = costPerUnit.times(item.quantityReceived)
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
            recordedBy: session.user.id,
            description: `Received ${item.quantityReceived}× ${productLabel} from route`,
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
            recordedBy: session.user.id,
            description: `Transit loss: ${transitLoss}× ${productLabel}`,
          })
        }

        results.push({
          itemId: sri.id,
          productLabel,
          expected: sri.quantity,
          received: item.quantityReceived,
          transitLoss,
        })
      }

      // Update route status to "received" if not already
      await tx
        .update(supplyRoutes)
        .set({ status: "received" })
        .where(eq(supplyRoutes.id, data.supplyRouteId))

      const totalReceived = results.reduce((sum, r) => sum + r.received, 0)
      const totalTransitLoss = results.reduce(
        (sum, r) => sum + r.transitLoss,
        0,
      )

      await recordAuditLog(tx, {
        actorUserId: session.user.id,
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: data.supplyRouteId,
        metadata: {
          itemCount: data.items.length,
          totalReceived,
          totalTransitLoss,
        },
      })

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
    with: { productColor: { with: { product: true } } },
  })
})

const setMinPriceInput = z.object({
  storeStockId: z.uuid(),
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
