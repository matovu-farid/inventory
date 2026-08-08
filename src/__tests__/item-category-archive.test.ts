import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { db } from '#/db'
import { itemCategories } from '#/db/schema'
import {
  archiveItemCategoryQuery,
  createItemCategoryQuery,
  listItemCategoriesQuery,
  restoreItemCategoryQuery,
  updateItemCategoryQuery,
} from '#/server/functions/items/categories.server'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const createdIds: string[] = []

afterAll(async () => {
  if (createdIds.length > 0) {
    await db.delete(itemCategories).where(inArray(itemCategories.id, createdIds))
  }
})

describe('item category archive lifecycle', () => {
  let categoryId = ''

  beforeAll(async () => {
    const created = await createItemCategoryQuery({
      name: `Archive category ${suffix}`,
    })
    categoryId = created.id
    createdIds.push(created.id)
  })

  it('lists active categories by default', async () => {
    const categories = await listItemCategoriesQuery()
    expect(categories.some((category) => category.id === categoryId)).toBe(true)
    expect(categories.every((category) => category.deletedAt === null)).toBe(true)
  })

  it('renames the canonical category record', async () => {
    const renamed = await updateItemCategoryQuery({
      id: categoryId,
      name: `Renamed category ${suffix}`,
    })
    expect(renamed.name).toBe(`Renamed category ${suffix}`)
  })

  it('hides archived categories by default but returns them explicitly', async () => {
    await archiveItemCategoryQuery({ id: categoryId })

    const active = await listItemCategoriesQuery()
    expect(active.some((category) => category.id === categoryId)).toBe(false)

    const withArchived = await listItemCategoriesQuery({ includeArchived: true })
    expect(withArchived.find((category) => category.id === categoryId)?.deletedAt).not.toBeNull()
  })

  it('restores an archived category', async () => {
    const restored = await restoreItemCategoryQuery({ id: categoryId })
    expect(restored.deletedAt).toBeNull()
  })

  it('rejects a duplicate active category name', async () => {
    const duplicate = await createItemCategoryQuery({
      name: `Duplicate category ${suffix}`,
    })
    createdIds.push(duplicate.id)

    await expect(
      createItemCategoryQuery({ name: `Duplicate category ${suffix}` }),
    ).rejects.toThrow(/already exists/i)
  })
})
