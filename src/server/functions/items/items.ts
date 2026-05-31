import { createServerFn } from "@tanstack/react-start"
import { eq, ilike, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { items, itemColors, itemCategories, variants } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { materializeVariantsFromColorsSizes } from "./variants-materialize"

const colorInput = z.object({
  colorName: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

const upsertInput = z.object({
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  // Sizes are no longer persisted on items (issue #7 drops items.sizes).
  // The caller still passes them on create so the server can materialize
  // the (colors × sizes) cross product into the variants table.
  sizes: z.array(z.string().min(1).max(16)).default([]),
  colors: z.array(colorInput).default([]),
  itemCategoryId: z.uuid().optional(),
})

/**
 * Returns the id of the "Uncategorized" item-category, falling back to
 * raising if the seed row is missing (drizzle/0009_item_categories.sql
 * inserts it). Used as the default category for newly created items when
 * the caller hasn't picked one yet.
 */
async function getUncategorizedId(): Promise<string> {
  const row = await db.query.itemCategories.findFirst({
    where: eq(itemCategories.name, "Uncategorized"),
  })
  if (!row) {
    throw new Error(
      'Missing seed row: item_categories."Uncategorized". Run drizzle/0009_item_categories.sql.',
    )
  }
  return row.id
}

// Item-detail queries hydrate the variants list so UI flows that pick a
// (color, size) cell — opening balance, supply route editor — can map that
// pair back to a `variantId` client-side. The variant is the unit of stock
// since #4 / #5 / #6 and the source of truth for an item's sizes since #7.
const ITEM_DETAIL_WITH = {
  colors: true,
  variants: {
    columns: { id: true, colorId: true, size: true },
  },
} as const

export const listItems = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  return db.query.items.findMany({
    with: ITEM_DETAIL_WITH,
    orderBy: (p, { asc }) => [asc(p.articleNumber)],
  })
})

export const getItemByArticle = createServerFn()
  .inputValidator(z.object({ articleNumber: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    return db.query.items.findFirst({
      where: eq(items.articleNumber, data.articleNumber),
      with: ITEM_DETAIL_WITH,
    })
  })

export const searchItems = createServerFn()
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    if (!data.query.trim()) {
      return db.query.items.findMany({ with: ITEM_DETAIL_WITH, limit: 20 })
    }
    const like = `%${data.query}%`
    return db.query.items.findMany({
      where: or(ilike(items.articleNumber, like), ilike(items.name, like)),
      with: ITEM_DETAIL_WITH,
      limit: 20,
    })
  })

export const createItem = createServerFn()
  .inputValidator(upsertInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    // items.item_category_id is NOT NULL — when callers don't pick a
    // category, the new row inherits the seeded "Uncategorized" bucket.
    const itemCategoryId = data.itemCategoryId ?? (await getUncategorizedId())
    const [row] = await db
      .insert(items)
      .values({
        articleNumber: data.articleNumber,
        name: data.name,
        description: data.description,
        itemCategoryId,
      })
      .returning()

    // If the caller supplied colors, insert them now. If sizes were also
    // supplied, materialize the (color × size) cross product into the
    // variants table — that's how sizes are stored after #7 dropped the
    // items.sizes column.
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
  })

export const updateItem = createServerFn()
  .inputValidator(
    upsertInput
      .extend({ id: z.uuid() })
      // On update, sizes/colors are managed independently through the
      // variant + color endpoints; ignore them here so callers don't have
      // to send the full payload.
      .partial({ sizes: true, colors: true }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, itemCategoryId, sizes: _sizes, colors: _colors, ...fields } = data
    void _sizes
    void _colors
    const patch = {
      articleNumber: fields.articleNumber,
      name: fields.name,
      description: fields.description,
      ...(itemCategoryId === undefined ? {} : { itemCategoryId }),
    }
    const [row] = await db.update(items).set(patch).where(eq(items.id, id)).returning()
    return row
  })

/**
 * Lists the sizes currently materialized for an item by reading the
 * variants table. Returns the unique set of sizes (preserves the
 * insertion order); the UI sorts via deriveSizes() for display.
 */
export const listItemSizes = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const rows = await db
      .select({ size: variants.size })
      .from(variants)
      .where(eq(variants.itemId, data.itemId))
    const seen = new Set<string>()
    for (const r of rows) seen.add(r.size)
    return [...seen]
  })
