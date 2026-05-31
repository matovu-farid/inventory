import { createServerFn } from "@tanstack/react-start"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  storeReceivings,
  storeStock,
  supplyRoutes,
  supplyRouteLines,
  variants,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatItemLabel } from "#/lib/items"
import { renderAuditDescription } from "#/server/audit/descriptions"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { getActorName } from "#/server/audit/actor"
import { isSameDayKampala, formatDayKampala } from "#/lib/business-date"
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
          itemColor: { with: { item: true } },
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
    .select({ supplyRouteLineId: storeReceivings.supplyRouteLineId })
    .from(storeReceivings)
    .where(
      sql`${storeReceivings.supplyRouteLineId} IN (${sql.join(
        allItemIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )

  const receivedItemIds = new Set(receivedRows.map((r) => r.supplyRouteLineId))
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

    const items = await db.query.supplyRouteLines.findMany({
      where: eq(supplyRouteLines.supplyRouteId, data.supplyRouteId),
      with: {
        supplier: true,
        itemColor: { with: { item: true } },
      },
    })

    if (items.length === 0) return []

    const receivedIds = new Set(
      (
        await db
          .select({ supplyRouteLineId: storeReceivings.supplyRouteLineId })
          .from(storeReceivings)
          .where(
            sql`${storeReceivings.supplyRouteLineId} IN (${sql.join(
              items.map((i) => sql`${i.id}`),
              sql`, `,
            )})`,
          )
      ).map((r) => r.supplyRouteLineId),
    )

    return items.filter((item) => !receivedIds.has(item.id))
  })

const receiveItemInput = z.object({
  supplyRouteLineId: z.uuid(),
  quantityReceived: z.number().int().min(0),
  discrepancyNotes: z.string().optional(),
})

const receiveGoodsInput = z.object({
  supplyRouteId: z.uuid(),
  items: z.array(receiveItemInput).min(1),
  receivedDate: z.coerce.date().optional(),
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

    const now = new Date()
    const receivedDate = data.receivedDate ?? now

    if (receivedDate.getTime() > now.getTime()) {
      throw new Error("Receipt date can't be in the future.")
    }

    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, data.supplyRouteId),
    })
    if (!route) throw new Error("Supply route not found.")
    if (route.departureDate) {
      const departure = new Date(route.departureDate)
      if (receivedDate.getTime() < departure.getTime()) {
        throw new Error(
          `Receipt date can't be before goods left China (${formatDayKampala(departure)}).`,
        )
      }
    }

    if (!isSameDayKampala(receivedDate, now)) {
      if (session.user.role !== "admin") {
        throw new Error("Only admins can change the receipt date.")
      }
    }

    return db.transaction(async (tx) => {
      const results: Array<{
        itemId: string
        itemLabel: string
        expected: number
        received: number
        transitLoss: number
      }> = []
      const auditLines: Array<{
        supplyRouteLineId: string
        variantId: string
        colorName: string
        size: string
        quantityReceived: number
      }> = []

      for (const item of data.items) {
        // Get the supply route item with product chain for log strings
        const sri = await tx.query.supplyRouteLines.findFirst({
          where: eq(supplyRouteLines.id, item.supplyRouteLineId),
          with: { itemColor: { with: { item: true } } },
        })
        if (!sri) throw new Error(`Supply route item not found: ${item.supplyRouteLineId}`)

        // Receiving requires a fully-resolved variant. Aggregate/color-only
        // procurement rows (Task 1) must be split into color+size variants
        // by an admin before they can land in store stock.
        const itemColor = sri.itemColor
        const sriSize = sri.size
        const sriColorId = sri.colorId
        if (!itemColor || !sriSize || !sriColorId) {
          throw new Error(
            `Item ${sri.id} is missing color or size — split it into full variants before receiving`,
          )
        }

        // Resolve the variant the stock row should target. If the catalog
        // declared this (color, size) pair the variant was seeded by
        // `pnpm backfill:variants`; otherwise materialise it on the fly so
        // the supply line can still land in stock without an admin detour.
        // Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md
        // §3 "Special case — supply_route_lines".
        let variantRow = await tx.query.variants.findFirst({
          where: and(
            eq(variants.colorId, sriColorId),
            eq(variants.size, sriSize),
          ),
        })
        if (!variantRow) {
          const [created] = await tx
            .insert(variants)
            .values({
              itemId: itemColor.itemId,
              colorId: sriColorId,
              size: sriSize,
            })
            .returning()
          variantRow = created
        }

        const itemLabel = formatItemLabel(
          itemColor.item.articleNumber,
          itemColor.colorName,
          sriSize,
        )

        // One receipt per item — refuse if already received
        const prior = await tx.query.storeReceivings.findFirst({
          where: eq(storeReceivings.supplyRouteLineId, sri.id),
        })
        if (prior) {
          throw new Error(
            `${itemLabel} has already been received on this route`,
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
          supplyRouteLineId: sri.id,
          receivedDate: receivedDate,
          quantityExpected: sri.quantity,
          quantityReceived: item.quantityReceived,
          discrepancyNotes: item.discrepancyNotes,
          receivedBy: session.user.id,
        })

        // 2. Upsert StoreStock — merge into existing (storeId, variantId) row
        if (sri.quantity <= 0) throw new Error("Invalid supply route item quantity")
        const costPerUnit = new BigNumber(sri.totalCostUgx)
          .div(sri.quantity)
          .dp(2, BigNumber.ROUND_HALF_UP)

        if (item.quantityReceived > 0) {
          await tx
            .insert(storeStock)
            .values({
              storeId: store.id,
              variantId: variantRow.id,
              supplyRouteLineId: sri.id,
              quantityOnHand: item.quantityReceived,
              costPerUnitUgx: costPerUnit.toFixed(2),
              minimumSellPriceUgx: costPerUnit.toFixed(2), // default; admin sets real price later
            })
            .onConflictDoUpdate({
              target: [storeStock.storeId, storeStock.variantId],
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
            transactionDate: receivedDate,
            description: `Received ${item.quantityReceived}× ${itemLabel} from route`,
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
            transactionDate: receivedDate,
            description: `Transit loss: ${transitLoss}× ${itemLabel}`,
          })
        }

        results.push({
          itemId: sri.id,
          itemLabel,
          expected: sri.quantity,
          received: item.quantityReceived,
          transitLoss,
        })
        auditLines.push({
          supplyRouteLineId: sri.id,
          variantId: variantRow.id,
          colorName: itemColor.colorName,
          size: sriSize,
          quantityReceived: item.quantityReceived,
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

      const actorName = await getActorName(tx, session.user.id)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: data.supplyRouteId,
        metadata: null,
      })

      const businessDate = isSameDayKampala(receivedDate, now)
        ? null
        : receivedDate

      await recordAuditLog(tx, {
        actorUserId: session.user.id,
        action: "store.receiveGoods",
        entityType: "supply_route",
        entityId: data.supplyRouteId,
        description: renderAuditDescription("store.receiveGoods", {
          actorName,
          routeName: route.name,
          itemCount: data.items.length,
          totalReceived,
          totalTransitLoss,
          businessDate: receivedDate,
          recordedAt: now,
        }),
        articleNumbers,
        businessDate,
        metadata: {
          itemCount: data.items.length,
          totalReceived,
          totalTransitLoss,
          receivedDate: receivedDate.toISOString(),
          // Per-line variant breakdown ((colorName, size) + variant_id +
          // received qty) so the audit row stays self-describing after the
          // variant_id swap; `articleNumbers` continues to carry the
          // denormalised SKU set for backwards compatibility.
          lines: auditLines,
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
    with: { variant: { with: { color: { with: { item: true } } } } },
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
