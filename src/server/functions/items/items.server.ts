// Server-only module: exports query helpers + Zod schemas for the items
// table. Split out from items.ts because that file is imported by
// client-reachable routes (src/routes/items/*); TanStack Start's
// import-protection plugin denies any client-reachable module that
// imports `#/db` at module scope. The `.server.ts` suffix is TanStack's
// canonical marker for a server-only module — the client bundle excludes
// it entirely. See:
// https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
//
// Consumers:
//   - src/server/functions/items/items.ts (createServerFn wrappers)
//   - src/__tests__/list-item-categories.test.ts (vitest, server-side)
//   - other vitest tests that need to exercise data semantics directly

import { asc, eq, ilike, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { items, itemColors, variants } from "#/db/schema"
import { materializeVariantsFromColorsSizes } from "./variants-materialize"

export const colorInput = z.object({
  colorName: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const upsertInput = z.object({
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  /**
   * Free-text catalog grouping. Required on create; the combobox in
   * item-editor.tsx populates this from `listItemCategories()` or accepts
   * a brand new value typed by the user.
   */
  category: z.string().trim().min(1).max(64),
  // Sizes are no longer persisted on items (issue #7 drops items.sizes).
  // The caller still passes them on create so the server can materialize
  // the (colors × sizes) cross product into the variants table.
  sizes: z.array(z.string().min(1).max(16)).default([]),
  colors: z.array(colorInput).default([]),
})

export const updateInput = upsertInput
  .extend({ id: z.uuid() })
  // On update, sizes/colors are managed independently through the
  // variant + color endpoints; ignore them here so callers don't have
  // to send the full payload. Category may be patched.
  .partial({ sizes: true, colors: true, category: true })

// Item-detail queries hydrate the variants list so UI flows that pick a
// (color, size) cell — opening balance, supply route editor — can map that
// pair back to a `variantId` client-side.
const ITEM_DETAIL_WITH = {
  colors: true,
  variants: {
    columns: { id: true, colorId: true, size: true },
  },
} as const

// ─── Pure query helpers ──────────────────────────────────────────────────────
// Exported separately from the createServerFn wrappers so that vitest can
// exercise the data semantics directly. TanStack's server-fn wrapper
// swallows return values when called outside SSR (see
// admin/item-categories.server.ts:57–60 for the same pattern).

export async function listItemsQuery() {
  return db.query.items.findMany({
    with: ITEM_DETAIL_WITH,
    orderBy: (p, { asc }) => [asc(p.articleNumber)],
  })
}

export async function getItemByArticleQuery(input: { articleNumber: string }) {
  return db.query.items.findFirst({
    where: eq(items.articleNumber, input.articleNumber),
    with: ITEM_DETAIL_WITH,
  })
}

export async function searchItemsQuery(input: { query: string }) {
  if (!input.query.trim()) {
    return db.query.items.findMany({ with: ITEM_DETAIL_WITH, limit: 20 })
  }
  const like = `%${input.query}%`
  return db.query.items.findMany({
    where: or(ilike(items.articleNumber, like), ilike(items.name, like)),
    with: ITEM_DETAIL_WITH,
    limit: 20,
  })
}

/**
 * Returns the distinct set of category values currently in use on items,
 * sorted ascending. Powers the create-item / detail-edit combobox.
 */
export async function listItemCategoriesQuery() {
  const rows = await db
    .selectDistinct({ category: items.category })
    .from(items)
    .orderBy(asc(items.category))
  return rows.map((r) => r.category)
}

export async function createItemQuery(data: z.infer<typeof upsertInput>) {
  const [row] = await db
    .insert(items)
    .values({
      articleNumber: data.articleNumber,
      name: data.name,
      description: data.description,
      category: data.category,
    })
    .returning()

  if (data.colors.length > 0) {
    const insertedColors = await db
      .insert(itemColors)
      .values(
        data.colors.map((c) => ({
          itemId: row.id,
          colorName: c.colorName,
          colorHex: c.colorHex,
        })),
      )
      .returning()
    if (data.sizes.length > 0) {
      await materializeVariantsFromColorsSizes({
        itemId: row.id,
        colorIds: insertedColors.map((c) => c.id),
        sizes: data.sizes,
      })
    }
  }
  return row
}

export async function updateItemQuery(data: z.infer<typeof updateInput>) {
  const { id, category, sizes: _sizes, colors: _colors, ...fields } = data
  void _sizes
  void _colors
  const patch = {
    articleNumber: fields.articleNumber,
    name: fields.name,
    description: fields.description,
    ...(category === undefined ? {} : { category }),
  }
  const [row] = await db.update(items).set(patch).where(eq(items.id, id)).returning()
  return row
}

/**
 * Lists the sizes currently materialized for an item by reading the
 * variants table. Returns the unique set of sizes (preserves the
 * insertion order); the UI sorts via deriveSizes() for display.
 */
export async function listItemSizesQuery(input: { itemId: string }) {
  const rows = await db
    .select({ size: variants.size })
    .from(variants)
    .where(eq(variants.itemId, input.itemId))
  const seen = new Set<string>()
  for (const r of rows) seen.add(r.size)
  return [...seen]
}
