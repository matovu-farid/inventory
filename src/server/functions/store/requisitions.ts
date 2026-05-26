import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  restockRequisitions,
  supplyRouteItems,
  supplyRoutes,
} from '#/db/schema'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'
import { formatProductLabel } from '#/lib/products'

/**
 * Lists open restock requisitions. Each requisition is keyed by `variant_id`
 * (per #5); we hydrate item + color + size from the variant relation so
 * downstream UI can render a human-readable product label.
 */
export const listOpenRequisitions = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ['admin', 'supervisor'])
  const rows = await db.query.restockRequisitions.findMany({
    where: eq(restockRequisitions.status, 'open'),
    with: {
      store: true,
      variant: {
        with: {
          item: true,
          color: true,
        },
      },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    storeName: r.store.name,
    variantId: r.variantId,
    size: r.variant.size,
    productLabel: formatProductLabel(
      r.variant.item.articleNumber,
      r.variant.color.colorName,
      r.variant.size,
    ),
    suggestedQuantity: r.suggestedQuantity,
    baseline: r.baselineQuantity,
    quantityAtOpen: r.quantityAtOpen,
    openedAt: r.openedAt,
  }))
})

const promoteInput = z.object({
  requisitionIds: z.array(z.uuid()).min(1),
  supplyRouteId: z.uuid(),
  supplierId: z.uuid(),
})

/**
 * Promotes a set of open restock requisitions into supply-route line items.
 *
 * Requisitions are addressed by `variant_id` (per #5); the supply-route
 * `*_items` tables still carry `(product_id, product_color_id, size)`
 * (rename to `*_lines` lives in Phase 2 of the spec). We project the variant
 * back to its color + size + parent item to fill in those legacy columns.
 */
export const promoteRequisitionsToRoute = createServerFn()
  .inputValidator(promoteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])

    return db.transaction(async (tx) => {
      // Lock target requisitions
      const target = await tx
        .select()
        .from(restockRequisitions)
        .where(inArray(restockRequisitions.id, data.requisitionIds))
        .for('update')

      const stillOpen = target.filter((r) => r.status === 'open')
      if (stillOpen.length !== target.length) {
        throw new Error(
          'Some requisitions are no longer open (already planned or dismissed).',
        )
      }

      const route = (
        await tx
          .select()
          .from(supplyRoutes)
          .where(eq(supplyRoutes.id, data.supplyRouteId))
      ).at(0)
      if (!route || route.status !== 'planning') {
        throw new Error("Supply route must be in 'planning' status.")
      }

      // Resolve each requisition's variant_id back to (item_id, color_id, size)
      // so we can keep supply_route_items happy with its legacy column shape.
      const variantIds = stillOpen.map((r) => r.variantId)
      const variantRows = await tx.query.variants.findMany({
        where: (v, ops) => ops.inArray(v.id, variantIds),
      })
      const variantById = new Map(variantRows.map((v) => [v.id, v]))

      for (const req of stillOpen) {
        const variant = variantById.get(req.variantId)
        if (!variant) {
          throw new Error(
            `Variant ${req.variantId} for requisition ${req.id} not found.`,
          )
        }
        const [item] = await tx
          .insert(supplyRouteItems)
          .values({
            supplyRouteId: data.supplyRouteId,
            supplierId: data.supplierId,
            productColorId: variant.colorId,
            productId: variant.itemId,
            size: variant.size,
            quantity: req.suggestedQuantity,
            unitPriceForeign: '0',
            foreignCurrency: 'RMB',
            totalAmountForeign: '0',
            totalCostUgx: '0',
          })
          .returning()
        await tx
          .update(restockRequisitions)
          .set({ status: 'planned', supplyRouteItemId: item.id })
          .where(eq(restockRequisitions.id, req.id))
      }
      return { promoted: stillOpen.length }
    })
  })

const dismissInput = z.object({
  id: z.uuid(),
  reason: z.string().min(1).max(500),
})

export const dismissRequisition = createServerFn()
  .inputValidator(dismissInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor'])
    await db
      .update(restockRequisitions)
      .set({
        status: 'dismissed',
        dismissedReason: data.reason,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(restockRequisitions.id, data.id),
          eq(restockRequisitions.status, 'open'),
        ),
      )
    return { ok: true }
  })
