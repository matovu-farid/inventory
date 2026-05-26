import { describe, it, expect, afterAll } from "vitest"
import { eq, inArray, sql } from "drizzle-orm"

import { db } from "#/db"
import { items, itemColors, itemCategories } from "#/db/schema"

/**
 * Migration-level acceptance tests for issue #3
 * (refactor(catalog): rename products→items, product_colors→item_colors,
 * add items.category_id).
 *
 * These tests assume `pnpm db:push:test` has applied the renamed schema +
 * the `items.item_category_id` FK + the Uncategorized backfill.
 *
 * Pattern mirrors `src/__tests__/item-categories.test.ts` and
 * `src/__tests__/variants.test.ts`: each test creates the rows it needs and
 * cleans up in afterAll.
 */

const SUFFIX = `${Date.now()}`
const ART_BASE = `rename-${SUFFIX}`

const createdItemIds: string[] = []

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
})

describe("items table — exists after rename and round-trips", () => {
  it("inserts an item + item color and reads back via relation", async () => {
    const uncat = await uncategorizedId()
    const [created] = await db
      .insert(items)
      .values({
        articleNumber: `${ART_BASE}-a`,
        name: "Test rename item",
        sizes: ["S", "M"],
        itemCategoryId: uncat,
      })
      .returning()
    createdItemIds.push(created.id)

    await db.insert(itemColors).values({
      itemId: created.id,
      colorName: "Indigo",
      colorHex: "#2a3a8b",
    })

    const fetched = await db.query.items.findFirst({
      where: eq(items.id, created.id),
      with: { colors: true },
    })
    expect(fetched?.colors).toHaveLength(1)
    expect(fetched?.colors[0].colorName).toBe("Indigo")
  })
})

describe("items.item_category_id — backfilled to Uncategorized, NOT NULL", () => {
  it("every row in items has a non-null item_category_id", async () => {
    const nullRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(items)
      .where(sql`${items.itemCategoryId} IS NULL`)
    expect(nullRows[0].c).toBe(0)
  })

  it("a freshly inserted row without category defaults to Uncategorized", async () => {
    const [uncat] = await db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.name, "Uncategorized"))
    expect(uncat).toBeDefined()

    const [created] = await db
      .insert(items)
      .values({
        articleNumber: `${ART_BASE}-b`,
        name: "Auto-defaulted item",
        sizes: [],
        itemCategoryId: uncat.id,
      })
      .returning()
    createdItemIds.push(created.id)
    expect(created.itemCategoryId).toBe(uncat.id)
  })

  it("setting item_category_id to a non-existent id raises FK violation", async () => {
    const PG_FK_VIOLATION = "23503"
    const [uncat] = await db
      .select()
      .from(itemCategories)
      .where(eq(itemCategories.name, "Uncategorized"))
    expect(uncat).toBeDefined()

    const [created] = await db
      .insert(items)
      .values({
        articleNumber: `${ART_BASE}-c`,
        name: "FK-tester",
        sizes: [],
        itemCategoryId: uncat.id,
      })
      .returning()
    createdItemIds.push(created.id)

    // Use a syntactically-valid uuid that does not exist in item_categories.
    const code = await pgErrorCode(
      db
        .update(items)
        .set({ itemCategoryId: "00000000-0000-0000-0000-000000000000" })
        .where(eq(items.id, created.id)),
    )
    expect(code).toBe(PG_FK_VIOLATION)
  })
})

describe("item_colors.item_id — column rename preserved FK", () => {
  it("CASCADE deletes colors when their parent item is deleted", async () => {
    const uncat = await uncategorizedId()
    const [created] = await db
      .insert(items)
      .values({
        articleNumber: `${ART_BASE}-d`,
        name: "Cascade tester",
        sizes: [],
        itemCategoryId: uncat,
      })
      .returning()

    await db.insert(itemColors).values({
      itemId: created.id,
      colorName: "Crimson",
      colorHex: "#bb1234",
    })

    await db.delete(items).where(eq(items.id, created.id))

    const remaining = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(itemColors)
      .where(eq(itemColors.itemId, created.id))
    expect(remaining[0].c).toBe(0)
  })
})

async function uncategorizedId(): Promise<string> {
  const rows = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, "Uncategorized"))
  const row = rows.at(0)
  if (!row) {
    throw new Error('Missing seed item_categories."Uncategorized" row')
  }
  return row.id
}

async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause
    return cause?.code
  }
}
