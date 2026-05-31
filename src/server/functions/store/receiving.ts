import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNull, sql } from "drizzle-orm"
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
          // `item` carries the article number on aggregate lines that
          // have no itemColor yet. `itemColor.item` is the path for
          // fully-resolved lines.
          item: true,
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
        // Include the direct `item` relation so aggregate lines
        // (variant_id NULL) still render an article number on the
        // receiving page UI introduced in Task 9.
        item: true,
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
        itemId: string
        variantId: string | null
        colorName: string | null
        size: string | null
        quantityReceived: number
      }> = []

      for (const item of data.items) {
        // Get the supply route item with product chain for log strings.
        // We pull both the direct `item` relation (so unresolved/aggregate
        // lines without an itemColor still resolve a label and itemId) and
        // the `itemColor` (with its parent item) for the fully-resolved
        // variant path.
        const sri = await tx.query.supplyRouteLines.findFirst({
          where: eq(supplyRouteLines.id, item.supplyRouteLineId),
          with: {
            item: true,
            itemColor: { with: { item: true } },
          },
        })
        if (!sri) throw new Error(`Supply route item not found: ${item.supplyRouteLineId}`)

        // Receiving now accepts unresolved supply lines: aggregate
        // (itemId only) and color-only rows land in store_stock with a
        // NULL variant_id. They get resolved into per-variant lots later
        // via the "Specify" action. Spec:
        // docs/superpowers/specs/2026-05-31-variant-flexibility-design.md.
        const itemColor = sri.itemColor
        // A line is "resolved" when it carries both a color and a size.
        // Bind to locals so the closure below holds a narrowed type
        // instead of relying on a flag + non-null assertions.
        const resolved =
          itemColor && sri.colorId && sri.size
            ? {
                itemColor,
                colorId: sri.colorId,
                size: sri.size,
              }
            : null

        // Resolve item_id for the stock row — works whether or not the
        // line carries a fully-resolved variant. Prefer the direct
        // `item` FK on the supply line (newly required for #6); fall back
        // to the item reachable through itemColor for older rows.
        const itemId = sri.itemId ?? sri.itemColor?.itemId
        if (!itemId) {
          throw new Error(
            `Supply line ${sri.id} has no item — cannot receive`,
          )
        }

        // Resolve / materialise the variant only for fully-resolved
        // lines. Aggregate/color-only lines persist with variantId NULL
        // and are split later by `specifyStock`. Use an upsert keyed on
        // the existing uq_variant_item_color_size constraint so two
        // concurrent receives of the same (item, color, size) pair on
        // different supply lines can't race each other into a unique
        // violation.
        let variantRow: { id: string } | null = null
        if (resolved) {
          const [upserted] = await tx
            .insert(variants)
            .values({
              itemId,
              colorId: resolved.colorId,
              size: resolved.size,
            })
            .onConflictDoUpdate({
              target: [variants.itemId, variants.colorId, variants.size],
              set: { updatedAt: new Date() },
            })
            .returning()
          variantRow = upserted
        }

        // Resolve a display article number that works whether the line
        // arrived via the direct item FK or via itemColor only.
        const articleNumber =
          sri.item?.articleNumber ??
          sri.itemColor?.item.articleNumber ??
          "?"
        const itemLabel = resolved
          ? formatItemLabel(
              resolved.itemColor.item.articleNumber,
              resolved.itemColor.colorName,
              resolved.size,
            )
          : `${articleNumber} (unresolved)`

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
          // The new key is (store, item, variant_or_null, supply_line).
          // `onConflictDoUpdate` doesn't compose with NULL columns
          // cleanly, so we do an explicit find-then-insert-or-update.
          // Storage matches the uq_ss_store_item_variant_line constraint
          // (NULLS NOT DISTINCT) — at most one unresolved row per
          // (store, item, supply_line).
          const existing = await tx.query.storeStock.findFirst({
            where: and(
              eq(storeStock.storeId, store.id),
              eq(storeStock.itemId, itemId),
              variantRow
                ? eq(storeStock.variantId, variantRow.id)
                : isNull(storeStock.variantId),
              eq(storeStock.supplyRouteLineId, sri.id),
            ),
          })

          if (existing) {
            await tx
              .update(storeStock)
              .set({
                quantityOnHand: sql`${storeStock.quantityOnHand} + ${item.quantityReceived}`,
              })
              .where(eq(storeStock.id, existing.id))
          } else {
            await tx.insert(storeStock).values({
              storeId: store.id,
              itemId,
              variantId: variantRow?.id ?? null,
              supplyRouteLineId: sri.id,
              quantityOnHand: item.quantityReceived,
              costPerUnitUgx: costPerUnit.toFixed(2),
            })
          }
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
          itemId,
          variantId: variantRow?.id ?? null,
          colorName: itemColor?.colorName ?? null,
          size: sri.size ?? null,
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
 * Get current store stock grouped by item. Each group carries the parent
 * item (with its colors so the SpecifyStockDialog can offer them), the
 * total quantity across all rows for that item, and the underlying stock
 * rows so the UI can show a variant breakdown plus any unresolved lots.
 *
 * After the variant-flexibility change (#2026-05-31) `variant_id` is
 * nullable: a row with `variant: null` is "unresolved" — received against
 * an aggregate (item-only) supply line and not yet split into specific
 * (color, size) lines via `specifyStock`.
 */
export const getStoreStock = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const store = await db.query.stores.findFirst()
  if (!store) return []

  const rows = await db.query.storeStock.findMany({
    where: eq(storeStock.storeId, store.id),
    with: {
      item: { with: { colors: true } },
      variant: { with: { color: true } },
      supplyRouteLine: true,
    },
  })

  type Row = (typeof rows)[number]
  const byItem = new Map<
    string,
    {
      item: Row["item"]
      totalQty: number
      rows: Row[]
    }
  >()
  for (const r of rows) {
    const key = r.itemId
    const bucket = byItem.get(key) ?? {
      item: r.item,
      totalQty: 0,
      rows: [] as Row[],
    }
    bucket.totalQty += r.quantityOnHand
    bucket.rows.push(r)
    byItem.set(key, bucket)
  }

  return Array.from(byItem.values()).sort((a, b) =>
    a.item.articleNumber.localeCompare(b.item.articleNumber),
  )
})

