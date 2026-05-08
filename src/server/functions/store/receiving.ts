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
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import {
  validateDiscrepancyNotes,
  validateQuantityReceived,
} from "./receive-validate"

/**
 * Pure helper: given routes (with items) and the set of supply-route-item
 * IDs that already have a StoreReceiving record, return only routes that
 * still have ≥1 unreceived item. Empty-item routes are excluded.
 */
export function filterRoutesWithUnreceivedItems<
  R extends { items: Array<{ id: string }> },
>(routes: R[], receivedItemIds: ReadonlySet<string>): R[] {
  return routes.filter(
    (r) =>
      r.items.length > 0 &&
      r.items.some((it) => !receivedItemIds.has(it.id)),
  )
}

/**
 * List supply routes that still have items waiting to be received at the
 * store. A route is "receivable" when its status is "in_transit" or
 * "received" AND at least one of its items has no StoreReceiving record yet.
 */
export const listReceivableRoutes = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const routes = await db.query.supplyRoutes.findMany({
    where: (r, { inArray }) => inArray(r.status, ["in_transit", "received"]),
    with: {
      items: { with: { supplier: true } },
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
  .inputValidator(z.object({ supplyRouteId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const items = await db.query.supplyRouteItems.findMany({
      where: eq(supplyRouteItems.supplyRouteId, data.supplyRouteId),
      with: { supplier: true },
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
  supplyRouteItemId: z.string().uuid(),
  quantityReceived: z.number().int().min(0),
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
        transitLoss: number
      }> = []

      for (const item of data.items) {
        // Get the supply route item
        const sri = await tx.query.supplyRouteItems.findFirst({
          where: eq(supplyRouteItems.id, item.supplyRouteItemId),
        })
        if (!sri) throw new Error(`Supply route item not found: ${item.supplyRouteItemId}`)

        // One receipt per item — refuse if already received
        const prior = await tx.query.storeReceivings.findFirst({
          where: eq(storeReceivings.supplyRouteItemId, sri.id),
        })
        if (prior) {
          throw new Error(
            `${sri.productName} has already been received on this route`,
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
              quantityOnHand: sql`${storeStock.quantityOnHand} + ${item.quantityReceived}`,
            })
            .where(eq(storeStock.id, existing.id))
        } else if (item.quantityReceived > 0) {
          await tx.insert(storeStock).values({
            storeId: store.id,
            productName: sri.productName,
            articleNumber: sri.articleNumber,
            supplyRouteItemId: sri.id,
            quantityOnHand: item.quantityReceived,
            costPerUnitUgx: costPerUnit.toFixed(2),
            minimumSellPriceUgx: costPerUnit.toFixed(2), // default; admin sets real price later
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
            recordedBy: (session.user as { id: string }).id,
            description: `Received ${item.quantityReceived}x ${sri.productName} from route`,
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
        actorUserId: (session.user as { id: string }).id,
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
