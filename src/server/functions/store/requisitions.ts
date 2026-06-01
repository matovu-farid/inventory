import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  restockRequisitions,
  supplyRouteLines,
  supplyRoutes,
} from '#/db/schema'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'

/**
 * Plan 2c: requisitions are item-keyed. The UI renders an item label
 * (article + name); no variant breakdown.
 */
export const listOpenRequisitions = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ['admin', 'supervisor'])
  const rows = await db.query.restockRequisitions.findMany({
    where: eq(restockRequisitions.status, 'open'),
    with: {
      store: true,
      item: true,
    },
  })
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    storeName: r.store.name,
    itemId: r.itemId,
    itemLabel: `${r.item.articleNumber} ${r.item.name}`,
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
 * Promotes a set of open restock requisitions into supply-route lines.
 *
 * Plan 2c: requisitions are item-keyed, so the resulting supply_route_lines
 * are also unresolved (no color/size). The receiving flow already accepts
 * unresolved lines (Plan 1 receiveGoods), and they can be split into
 * variants pre- or post-receipt.
 */
export const promoteRequisitionsToRoute = createServerFn()
  .inputValidator(promoteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])

    return db.transaction(async (tx) => {
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

      for (const req of stillOpen) {
        const [line] = await tx
          .insert(supplyRouteLines)
          .values({
            supplyRouteId: data.supplyRouteId,
            supplierId: data.supplierId,
            itemId: req.itemId,
            colorId: null,
            size: null,
            quantity: req.suggestedQuantity,
            unitPriceForeign: '0',
            foreignCurrency: 'RMB',
            totalAmountForeign: '0',
            totalCostUgx: '0',
          })
          .returning()
        await tx
          .update(restockRequisitions)
          .set({ status: 'planned', supplyRouteLineId: line.id })
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
