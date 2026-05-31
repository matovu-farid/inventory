import { describe, it, expect, afterAll } from 'vitest'
import { eq, inArray, and, sql } from 'drizzle-orm'

import { db } from '#/db'
import { items, itemColors, itemCategories, variants } from '#/db/schema'
import { materializeVariantsFromColorsSizes } from '#/server/functions/items/variants-materialize'

// Drizzle's node-postgres adapter wraps DB errors as `Error("Failed query: …")`
// and stashes the underlying pg error on `.cause` (which carries the SQLSTATE
// code on `.code`). Use the SQLSTATE for assertions so the test does not
// depend on the human-readable message format.
const PG_UNIQUE_VIOLATION = '23505'

async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause
    return cause?.code
  }
}

// Real-DB integration tests. Mirror item-categories.test.ts: each test seeds
// the rows it needs through the schema and cleans them up in afterAll. The
// test database is set up via `pnpm db:push:test`.
//
// Issue #7 dropped `items.sizes`; this suite used to drive variant rows
// through the one-shot `backfillVariants` script that read items.sizes.
// After #7 the variants table is the source of truth for an item's sizes,
// so the same scenarios are now expressed through
// `materializeVariantsFromColorsSizes` (the helper the create / edit
// flows use).

const SUFFIX = `${Date.now()}`
const ART_A = `var-test-a-${SUFFIX}`
const ART_B = `var-test-b-${SUFFIX}`

const createdProductIds: string[] = []

afterAll(async () => {
  if (createdProductIds.length > 0) {
    // CASCADE on items → item_colors → variants cleans everything.
    await db.delete(items).where(inArray(items.id, createdProductIds))
  }
})

async function uncategorizedId(): Promise<string> {
  const rows = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, 'Uncategorized'))
  const row = rows.at(0)
  if (!row) {
    throw new Error('Missing "Uncategorized" seed row in test DB')
  }
  return row.id
}

describe('variants — materialize from (colors × sizes) cross product', () => {
  it('A: cross-product row count equals colors × sizes', async () => {
    const uncat = await uncategorizedId()
    const [prod] = await db
      .insert(items)
      .values({
        articleNumber: ART_A,
        name: `var-test-a-${SUFFIX}`,
        itemCategoryId: uncat,
      })
      .returning()
    createdProductIds.push(prod.id)

    const colors = await db
      .insert(itemColors)
      .values([
        { itemId: prod.id, colorName: 'Red', colorHex: '#ff0000' },
        { itemId: prod.id, colorName: 'Blue', colorHex: '#0000ff' },
      ])
      .returning()

    const summary = await materializeVariantsFromColorsSizes({
      itemId: prod.id,
      colorIds: colors.map((c) => c.id),
      sizes: ['S', 'M', 'L'],
    })

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, prod.id))
    // 2 colors × 3 sizes = 6 variants.
    expect(rows).toHaveLength(6)
    expect(summary.inserted).toBe(6)
  })

  it('B: a product with empty sizes produces zero variants', async () => {
    const uncat = await uncategorizedId()
    const [prod] = await db
      .insert(items)
      .values({
        articleNumber: ART_B,
        name: `var-test-b-${SUFFIX}`,
        itemCategoryId: uncat,
      })
      .returning()
    createdProductIds.push(prod.id)

    const [color] = await db
      .insert(itemColors)
      .values({ itemId: prod.id, colorName: 'Green', colorHex: '#00ff00' })
      .returning()

    await materializeVariantsFromColorsSizes({
      itemId: prod.id,
      colorIds: [color.id],
      sizes: [],
    })

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, prod.id))
    expect(rows).toHaveLength(0)
  })

  it('C: unique (item_id, color_id, size) rejects duplicate insertion', async () => {
    const [prod] = createdProductIds.length
      ? await db
          .select()
          .from(items)
          .where(eq(items.id, createdProductIds[0]))
      : []
    expect(prod).toBeDefined()

    const [color] = await db
      .select()
      .from(itemColors)
      .where(eq(itemColors.itemId, prod.id))
      .limit(1)

    const code = await pgErrorCode(
      db
        .insert(variants)
        .values({ itemId: prod.id, colorId: color.id, size: 'S' }),
    )
    expect(code).toBe(PG_UNIQUE_VIOLATION)
  })

  it('C2: re-running materialize is idempotent (ON CONFLICT DO NOTHING)', async () => {
    // Scope to the products this test file created so we don't measure
    // rows that other parallel test files may have inserted/deleted.
    const itemIds = [...createdProductIds]
    const before = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(variants)
      .where(inArray(variants.itemId, itemIds))
    // Re-materialize the original (Red, Blue × S, M, L) — should be a
    // no-op because every row already exists.
    const colors = await db
      .select()
      .from(itemColors)
      .where(eq(itemColors.itemId, itemIds[0]))
    await materializeVariantsFromColorsSizes({
      itemId: itemIds[0],
      colorIds: colors.map((c) => c.id),
      sizes: ['S', 'M', 'L'],
    })
    const after = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(variants)
      .where(inArray(variants.itemId, itemIds))
    expect(after[0].c).toBe(before[0].c)
  })

  it('D: unique partial barcode allows multiple NULLs, rejects duplicate non-NULL', async () => {
    const prodId = createdProductIds[0]
    const colors = await db
      .select()
      .from(itemColors)
      .where(eq(itemColors.itemId, prodId))

    // Two existing variants without barcode should already coexist after
    // materialize — both have NULL barcode, so a third NULL is fine.
    // Insert a brand-new variant row for another size; materialize is
    // idempotent and leaves existing rows untouched, so we exercise
    // barcode uniqueness directly.
    const barcode = `bc-${SUFFIX}`

    // Replace one existing variant's barcode with our value.
    await db
      .update(variants)
      .set({ barcode })
      .where(
        and(
          eq(variants.itemId, prodId),
          eq(variants.colorId, colors[0].id),
          eq(variants.size, 'S'),
        ),
      )

    // Same barcode on another row must violate the unique partial index.
    const code = await pgErrorCode(
      db
        .update(variants)
        .set({ barcode })
        .where(
          and(
            eq(variants.itemId, prodId),
            eq(variants.colorId, colors[0].id),
            eq(variants.size, 'M'),
          ),
        ),
    )
    expect(code).toBe(PG_UNIQUE_VIOLATION)

    // Two NULL barcodes are still allowed (the M and L rows are both NULL).
    const nullBarcodeRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(variants)
      .where(and(eq(variants.itemId, prodId), sql`barcode IS NULL`))
    expect(nullBarcodeRows[0].c).toBeGreaterThanOrEqual(2)
  })
})
