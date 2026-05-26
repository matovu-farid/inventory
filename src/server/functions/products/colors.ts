import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { itemColors, variants } from '#/db/schema'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'
import { materializeVariantsFromColorsSizes } from './variants-materialize'

const hexRule = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const addProductColor = createServerFn()
  .inputValidator(
    z.object({
      productId: z.uuid(),
      colorName: z.string().min(1).max(40),
      colorHex: hexRule,
      /**
       * Sizes to materialize as variants alongside the new color. If
       * omitted, the server derives the size set from the item's
       * existing variants — useful when the user adds a new color to
       * an item whose other colors already declare a size lineup.
       */
      sizes: z.array(z.string().min(1).max(16)).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor'])
    // App-level uniqueness check on (itemId, colorName) — the schema's
    // idx_ic_unique is a non-unique index, so we guard here.
    const existing = await db.query.itemColors.findFirst({
      where: and(
        eq(itemColors.itemId, data.productId),
        eq(itemColors.colorName, data.colorName),
      ),
    })
    if (existing)
      throw new Error(
        `Color "${data.colorName}" already exists for this product`,
      )
    const [row] = await db
      .insert(itemColors)
      .values({
        // The renamed `itemColors` table uses `itemId` for its TS property
        // (column `item_id`). The public input on this server function still
        // accepts `productId` so its callers don't have to change in lockstep
        // — the rename of consumer call-sites is out of scope for #3.
        itemId: data.productId,
        colorName: data.colorName,
        colorHex: data.colorHex,
      })
      .returning()

    // Resolve sizes to materialize. Explicit input wins; otherwise we
    // pick up whatever the item's other colors already declare so the
    // new color stays consistent with the rest of the catalog.
    let sizes = data.sizes
    if (!sizes || sizes.length === 0) {
      const existingVariants = await db
        .select({ size: variants.size })
        .from(variants)
        .where(eq(variants.itemId, data.productId))
      const seen = new Set<string>()
      for (const v of existingVariants) seen.add(v.size)
      sizes = [...seen]
    }
    if (sizes.length > 0) {
      await materializeVariantsFromColorsSizes({
        itemId: data.productId,
        colorIds: [row.id],
        sizes,
      })
    }
    return row
  })

export const updateProductColor = createServerFn()
  .inputValidator(
    z.object({
      id: z.uuid(),
      colorName: z.string().min(1).max(40).optional(),
      colorHex: hexRule.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor'])
    const { id, ...fields } = data
    const [row] = await db
      .update(itemColors)
      .set(fields)
      .where(eq(itemColors.id, id))
      .returning()
    return row
  })

export const setProductColorImage = createServerFn()
  .inputValidator(z.object({ id: z.uuid(), imageS3Key: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor'])
    const [row] = await db
      .update(itemColors)
      .set({ imageS3Key: data.imageS3Key })
      .where(eq(itemColors.id, data.id))
      .returning()
    return row
  })

export const deleteProductColor = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])
    await db.delete(itemColors).where(eq(itemColors.id, data.id))
  })

/**
 * Returns all item colors with their parent item, ordered by article
 * number then color name.  Used by the notification-override UI to populate
 * the variant picker.
 */
export const listProductColorsForOverrides = createServerFn().handler(
  async () => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor'])
    return db.query.itemColors.findMany({
      // Relation key kept as `product` to avoid forcing every UI consumer
      // to rename `pc.product` → `pc.item` in lockstep with this DB rename.
      with: { product: true },
      orderBy: (ic, { asc }) => [asc(ic.itemId), asc(ic.colorName)],
    })
  },
)

/**
 * Returns every variant (item × color × size) with enough catalog data to
 * render an article + color + size label.  Used by the notification
 * threshold-override picker now that overrides are keyed by `variant_id`.
 */
export const listVariantsForOverrides = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ['admin', 'supervisor'])
  return db.query.variants.findMany({
    with: {
      item: true,
      color: true,
    },
    orderBy: (v, { asc }) => [asc(v.itemId), asc(v.colorId), asc(v.size)],
  })
})
