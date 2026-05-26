import { createServerFn } from "@tanstack/react-start"
import { eq, ilike, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { items, itemCategories } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const upsertInput = z.object({
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  sizes: z.array(z.string().min(1).max(16)).default([]),
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

export const listProducts = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])
  return db.query.items.findMany({
    with: { colors: true },
    orderBy: (p, { asc }) => [asc(p.articleNumber)],
  })
})

export const getProductByArticle = createServerFn()
  .inputValidator(z.object({ articleNumber: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    return db.query.items.findFirst({
      where: eq(items.articleNumber, data.articleNumber),
      with: { colors: true },
    })
  })

export const searchProducts = createServerFn()
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    if (!data.query.trim()) {
      return db.query.items.findMany({ with: { colors: true }, limit: 20 })
    }
    const like = `%${data.query}%`
    return db.query.items.findMany({
      where: or(ilike(items.articleNumber, like), ilike(items.name, like)),
      with: { colors: true },
      limit: 20,
    })
  })

export const createProduct = createServerFn()
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
        sizes: data.sizes,
        itemCategoryId,
      })
      .returning()
    return row
  })

export const updateProduct = createServerFn()
  .inputValidator(upsertInput.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { id, itemCategoryId, ...fields } = data
    const patch = {
      ...fields,
      ...(itemCategoryId === undefined ? {} : { itemCategoryId }),
    }
    const [row] = await db.update(items).set(patch).where(eq(items.id, id)).returning()
    return row
  })
