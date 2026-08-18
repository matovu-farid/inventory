import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  shopStock,
  variants,
  items as itemsTable,
  itemColors,
} from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { recordAuditLog } from '#/server/middleware/audit-store'
import { renderAuditDescription } from '#/server/audit/descriptions'
import { getActorName } from '#/server/audit/actor'
import { formatItemArticleNumbers } from '#/lib/items/article-number'

const specifyLineInput = z.object({
  colorId: z.uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
})

const specifyShopStockInput = z.object({
  shopStockId: z.uuid(),
  lines: z.array(specifyLineInput).min(1),
})

/**
 * Shop-side mirror of `specifyStock` (see
 * `src/server/functions/store/specify.ts`). Splits an unresolved
 * shop_stock row (variant_id NULL) — typically one materialised by a
 * transfer receipt before the cashier knows the lot's colors/sizes —
 * into N variant-keyed rows + optional leftover. Cost and supply line
 * are inherited from the source row. Missing variants are auto-
 * materialised via an upsert keyed on uq_variant_item_color_size so
 * concurrent specify calls on the same (item, color, size) can't race
 * into a unique violation.
 *
 * Validation matches Plan 1 exactly (no divergent rules — Plan 2c will
 * reshape audit metadata across both call sites at once).
 *
 * Spec: docs/superpowers/specs/2026-05-31-variant-flexibility-design.md
 */
export const specifyShopStock = createServerFn()
  .inputValidator(specifyShopStockInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin'])

    return db.transaction(async (tx) => {
      const source = await tx.query.shopStock.findFirst({
        where: eq(shopStock.id, data.shopStockId),
      })
      if (!source) throw new Error('Stock row not found')
      if (source.variantId !== null) {
        throw new Error(
          'Stock row is already specified to a variant — cannot specify again',
        )
      }

      const totalSpecified = data.lines.reduce((s, l) => s + l.quantity, 0)
      if (totalSpecified > source.quantityOnHand) {
        throw new Error(
          `Specified total (${totalSpecified}) exceeds available (${source.quantityOnHand})`,
        )
      }

      // Validate every requested colorId belongs to the source item.
      for (const line of data.lines) {
        const color = await tx.query.itemColors.findFirst({
          where: eq(itemColors.id, line.colorId),
        })
        if (!color) throw new Error(`Color ${line.colorId} not found`)
        if (color.itemId !== source.itemId) {
          throw new Error(
            `Color ${line.colorId} does not belong to item ${source.itemId}`,
          )
        }
      }

      const item = await tx.query.items.findFirst({
        where: eq(itemsTable.id, source.itemId),
        with: { articleNumbers: true },
      })
      if (!item) throw new Error('Item not found')

      // For each requested (colorId, size): resolve-or-create variant via
      // upsert (matches the Task 7 follow-up race-safety pattern in
      // receiveGoods), then either merge into an existing variant-keyed
      // stock row sharing the same supply line, or insert a new one.
      for (const line of data.lines) {
        const [variantRow] = await tx
          .insert(variants)
          .values({
            itemId: source.itemId,
            colorId: line.colorId,
            size: line.size,
          })
          .onConflictDoUpdate({
            target: [variants.itemId, variants.colorId, variants.size],
            set: { updatedAt: new Date() },
          })
          .returning()

        const existing = await tx.query.shopStock.findFirst({
          where: and(
            eq(shopStock.shopId, source.shopId),
            eq(shopStock.itemId, source.itemId),
            eq(shopStock.variantId, variantRow.id),
            source.supplyRouteLineId
              ? eq(shopStock.supplyRouteLineId, source.supplyRouteLineId)
              : isNull(shopStock.supplyRouteLineId),
          ),
        })
        if (existing) {
          await tx
            .update(shopStock)
            .set({
              quantityOnHand: sql`${shopStock.quantityOnHand} + ${line.quantity}`,
            })
            .where(eq(shopStock.id, existing.id))
        } else {
          await tx.insert(shopStock).values({
            shopId: source.shopId,
            itemId: source.itemId,
            variantId: variantRow.id,
            supplyRouteLineId: source.supplyRouteLineId,
            quantityOnHand: line.quantity,
            costPerUnitUgx: source.costPerUnitUgx,
            minimumSellPriceUgx: source.minimumSellPriceUgx,
          })
        }
      }

      const remaining = source.quantityOnHand - totalSpecified
      if (remaining === 0) {
        await tx.delete(shopStock).where(eq(shopStock.id, source.id))
      } else {
        await tx
          .update(shopStock)
          .set({ quantityOnHand: remaining })
          .where(eq(shopStock.id, source.id))
      }

      const actorName = await getActorName(tx, session.user.id)
      await recordAuditLog(tx, {
        actorUserId: session.user.id,
        action: 'stock.specify',
        entityType: 'shop_stock',
        entityId: source.id,
        description: renderAuditDescription('stock.specify', {
          actorName,
          articleNumber: formatItemArticleNumbers(item.articleNumbers),
          itemName: item.name,
          specifiedTotal: totalSpecified,
          remainingUnresolved: remaining,
          variantCount: data.lines.length,
        }),
        articleNumbers: item.articleNumbers.map(
          (number) => number.articleNumber,
        ),
        businessDate: null,
        metadata: {
          itemId: source.itemId,
          shopId: source.shopId,
          supplyRouteLineId: source.supplyRouteLineId,
          lines: data.lines,
          remainingUnresolved: remaining,
        },
      })

      return {
        specified: totalSpecified,
        remainingUnresolved: remaining,
      }
    })
  })
