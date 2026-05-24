import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { eq, inArray } from "drizzle-orm"

import { db } from "#/db"
import { itemCategories } from "#/db/schema"
import {
  listItemCategoriesQuery,
  createItemCategoryQuery,
  renameItemCategoryQuery,
  deleteItemCategoryQuery,
} from "#/server/functions/admin/item-categories"

// We call the pure query helpers directly (mirroring audit-list.test.ts):
// TanStack's createServerFn wrapper swallows return values when invoked
// outside SSR, so we exercise the data semantics here and rely on the
// route-level / Cypress tests for RBAC + wrapper coverage.

const SUFFIX = `${Date.now()}`
const NAME_A = `cat-a-${SUFFIX}`
const NAME_B = `cat-b-${SUFFIX}`
const NAME_RENAMED = `cat-renamed-${SUFFIX}`

const createdIds: string[] = []

afterAll(async () => {
  if (createdIds.length > 0) {
    await db.delete(itemCategories).where(inArray(itemCategories.id, createdIds))
  }
  // Cleanup any orphans created by individual tests.
  await db
    .delete(itemCategories)
    .where(
      inArray(itemCategories.name, [NAME_A, NAME_B, NAME_RENAMED]),
    )
})

describe("item categories — query helpers", () => {
  it("createItemCategoryQuery inserts a row and returns it", async () => {
    const row = await createItemCategoryQuery({ name: NAME_A })
    expect(row.name).toBe(NAME_A)
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
    createdIds.push(row.id)
  })

  it("createItemCategoryQuery rejects duplicate names", async () => {
    await expect(createItemCategoryQuery({ name: NAME_A })).rejects.toThrow(
      /already exists|duplicate|unique/i,
    )
  })

  it("listItemCategoriesQuery returns rows sorted by name", async () => {
    const rowB = await createItemCategoryQuery({ name: NAME_B })
    createdIds.push(rowB.id)

    const rows = await listItemCategoriesQuery()
    const filtered = rows.filter((r) => r.name === NAME_A || r.name === NAME_B)
    expect(filtered.map((r) => r.name)).toEqual([NAME_A, NAME_B])
  })

  it("renameItemCategoryQuery updates the name in place", async () => {
    const original = createdIds[0]
    const renamed = await renameItemCategoryQuery({
      id: original,
      name: NAME_RENAMED,
    })
    expect(renamed.name).toBe(NAME_RENAMED)

    // Verify via direct query that the row is still discoverable by id.
    const [verify] = await db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.id, original))
    expect(verify.name).toBe(NAME_RENAMED)
  })

  it("renameItemCategoryQuery rejects when the new name is taken", async () => {
    // NAME_B is taken by createdIds[1]; trying to rename createdIds[0]
    // (currently NAME_RENAMED) to NAME_B should fail.
    await expect(
      renameItemCategoryQuery({ id: createdIds[0], name: NAME_B }),
    ).rejects.toThrow(/already exists|duplicate|unique/i)
  })

  it("deleteItemCategoryQuery removes the row", async () => {
    const id = createdIds[0]
    await deleteItemCategoryQuery({ id })

    const found = await db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.id, id))
    expect(found).toHaveLength(0)

    // Remove from cleanup list since the test already deleted it.
    createdIds.shift()
  })
})

describe("item categories — seed", () => {
  it("an 'Uncategorized' row exists (idempotent seed)", async () => {
    const row = await db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.name, "Uncategorized"))
      .limit(1)
    expect(row).toHaveLength(1)
  })
})

// Reference imports so the test still compiles before the implementation
// file exists. These are intentionally weak — the real assertions above
// will fail until the module is created.
beforeAll(() => {
  expect(typeof listItemCategoriesQuery).toBe("function")
  expect(typeof createItemCategoryQuery).toBe("function")
  expect(typeof renameItemCategoryQuery).toBe("function")
  expect(typeof deleteItemCategoryQuery).toBe("function")
})
