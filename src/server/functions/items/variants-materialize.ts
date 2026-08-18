import { db } from '#/db'
import type { DbOrTx } from '#/db'
import { variants } from '#/db/schema'

/**
 * Materialize the (colorIds × sizes) cross-product into the variants
 * table for a given item. Idempotent on the `uq_variant_item_color_size`
 * unique constraint — re-running with the same input is a no-op.
 *
 * Used by `createItem` / `updateProduct` (issue #7) so the legacy
 * `items.sizes text[]` column can be dropped: the set of variant rows is
 * the source of truth for an item's available sizes.
 */
export interface MaterializeInput {
  itemId: string
  colorIds: string[]
  sizes: string[]
}

export interface MaterializeResult {
  inserted: number
  skipped: number
}

export async function materializeVariantsFromColorsSizes(
  input: MaterializeInput,
  executor: DbOrTx = db,
): Promise<MaterializeResult> {
  const { itemId, colorIds, sizes } = input
  if (colorIds.length === 0 || sizes.length === 0) {
    return { inserted: 0, skipped: 0 }
  }

  const rows = colorIds.flatMap((colorId) =>
    sizes.map((size) => ({ itemId, colorId, size })),
  )

  // ON CONFLICT DO NOTHING keeps re-runs idempotent; .returning() then
  // tells us how many rows actually landed.
  const inserted = await executor
    .insert(variants)
    .values(rows)
    .onConflictDoNothing({
      target: [variants.itemId, variants.colorId, variants.size],
    })
    .returning()

  return {
    inserted: inserted.length,
    skipped: rows.length - inserted.length,
  }
}
