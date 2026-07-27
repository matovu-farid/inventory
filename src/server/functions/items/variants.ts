import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { variants } from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'

/**
 * Variant-level server functions for the item detail page (issue #7).
 * Variants are the unit of stock since issues #4–#6; this module lets
 * managers create / delete individual (item, color, size) rows from the
 * item detail UI.
 *
 * Delete is gated by FK restrict on every table that references
 * `variant_id` (shop_stock, store_stock, notification_threshold_overrides,
 * low_stock_alerts, restock_requisitions, shop_sale_lines via stock,
 * etc.). The handler catches the SQLSTATE 23503 violation and surfaces a
 * human-readable message instead of the raw pg error.
 */

const PG_FK_VIOLATION = '23503'
const PG_UNIQUE_VIOLATION = '23505'

function pgErrorCode(err: unknown): string | undefined {
  return (err as { cause?: { code?: string } }).cause?.code
}

export const createVariant = createServerFn()
  .inputValidator(
    z.object({
      itemId: z.uuid(),
      colorId: z.uuid(),
      size: z.string().min(1).max(16),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    try {
      const [row] = await db.insert(variants).values(data).returning()
      return row
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) {
        throw new Error(
          `A variant for size "${data.size}" already exists in this color.`,
        )
      }
      throw err
    }
  })

export const deleteVariant = createServerFn()
  .inputValidator(z.object({ variantId: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    try {
      const removed = (
        await db
          .delete(variants)
          .where(eq(variants.id, data.variantId))
          .returning()
      ).at(0)
      if (!removed) {
        throw new Error('Variant not found.')
      }
      return removed
    } catch (err) {
      if (pgErrorCode(err) === PG_FK_VIOLATION) {
        throw new Error(
          'This variant is in use by stock, sales, or notifications and cannot be deleted. Move or sell out its stock first.',
        )
      }
      throw err
    }
  })

/**
 * Lists variants for a given item. Used by the item detail page to
 * render the Variants subsection.
 */
export const listVariantsByItem = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor', 'sales'])
    return db.query.variants.findMany({
      where: eq(variants.itemId, data.itemId),
      with: {
        color: {
          columns: { id: true, colorName: true, colorHex: true },
        },
      },
    })
  })
