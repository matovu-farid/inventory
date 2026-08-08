import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { itemCategories } from '#/db/schema'

const categoryName = z.string().trim().min(1).max(64)

function normalizeName(name: string): string {
  return name.trim()
}

export async function listItemCategoriesQuery(input?: {
  includeArchived?: boolean
}) {
  return db.query.itemCategories.findMany({
    where: input?.includeArchived
      ? undefined
      : isNull(itemCategories.deletedAt),
    orderBy: [asc(itemCategories.name)],
  })
}

export async function createItemCategoryQuery(input: { name: string }) {
  const name = categoryName.parse(input.name)
  const existing = await db.query.itemCategories.findFirst({
    where: and(
      eq(itemCategories.name, name),
      isNull(itemCategories.deletedAt),
    ),
  })
  if (existing) throw new Error(`Category "${name}" already exists`)

  const [created] = await db
    .insert(itemCategories)
    .values({ name })
    .returning()
  return created
}

export async function findOrCreateItemCategoryQuery(input: { name: string }) {
  const name = categoryName.parse(input.name)
  const existing = await db.query.itemCategories.findFirst({
    where: and(
      eq(itemCategories.name, name),
      isNull(itemCategories.deletedAt),
    ),
  })
  if (existing) return existing

  try {
    const [created] = await db
      .insert(itemCategories)
      .values({ name })
      .returning()
    return created
  } catch (error) {
    const concurrent = await db.query.itemCategories.findFirst({
      where: and(
        eq(itemCategories.name, name),
        isNull(itemCategories.deletedAt),
      ),
    })
    if (concurrent) return concurrent
    throw error
  }
}

export async function updateItemCategoryQuery(input: {
  id: string
  name: string
}) {
  const name = categoryName.parse(input.name)
  const existing = await db.query.itemCategories.findFirst({
    where: and(
      eq(itemCategories.name, name),
      isNull(itemCategories.deletedAt),
    ),
  })
  if (existing && existing.id !== input.id) {
    throw new Error(`Category "${name}" already exists`)
  }

  const [updated] = await db
    .update(itemCategories)
    .set({ name: normalizeName(name) })
    .where(
      and(eq(itemCategories.id, input.id), isNull(itemCategories.deletedAt)),
    )
    .returning()
  if (!updated) throw new Error('Category not found')
  return updated
}

export async function archiveItemCategoryQuery(input: { id: string }) {
  const [archived] = await db
    .update(itemCategories)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(itemCategories.id, input.id), isNull(itemCategories.deletedAt)),
    )
    .returning()
  if (!archived) throw new Error('Category not found')
  return archived
}

export async function restoreItemCategoryQuery(input: { id: string }) {
  const [restored] = await db
    .update(itemCategories)
    .set({ deletedAt: null })
    .where(eq(itemCategories.id, input.id))
    .returning()
  if (!restored) throw new Error('Category not found')
  return restored
}
