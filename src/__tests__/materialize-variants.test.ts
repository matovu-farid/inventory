import { describe, it, expect, afterAll } from 'vitest'
import { eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import { items, itemColors, variants } from '#/db/schema'
import { materializeVariantsFromColorsSizes } from '#/server/functions/items/variants-materialize'

/**
 * Issue #7 — when an item is created/edited with a (colors[], sizes[])
 * pair, the server must materialize the cross-product into the variants
 * table. This replaces the old `items.sizes text[]` column as the source
 * of truth for "what sizes does this item come in" — sizes now live
 * implicitly via the set of variant rows.
 *
 * The helper is idempotent on the `uq_variant_item_color_size` unique
 * constraint so re-running it (during item edits that add a new color)
 * doesn't double-insert.
 */

const SUFFIX = `${Date.now()}`
const ART = `mat-${SUFFIX}`
const createdItemIds: string[] = []

afterAll(async () => {
  if (createdItemIds.length > 0) {
    // FK cascade on items → item_colors and items → variants handles
    // the dependent rows.
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
})

describe('materializeVariantsFromColorsSizes', () => {
  it('inserts the cross-product of (colorIds × sizes) as variant rows', async () => {
    const [item] = await db
      .insert(items)
      .values({
        articleNumber: `${ART}-a`,
        name: 'materialize tester A',
        category: 'Test',
      })
      .returning()
    createdItemIds.push(item.id)

    const [c1, c2] = await db
      .insert(itemColors)
      .values([
        { itemId: item.id, colorName: 'Red', colorHex: '#ff0000' },
        { itemId: item.id, colorName: 'Blue', colorHex: '#0000ff' },
      ])
      .returning()

    const result = await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [c1.id, c2.id],
      sizes: ['S', 'M', 'L'],
    })

    // 2 colors × 3 sizes = 6 rows inserted, none skipped on first run.
    expect(result.inserted).toBe(6)
    expect(result.skipped).toBe(0)

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, item.id))
    expect(rows).toHaveLength(6)
    const pairs = rows.map((r) => `${r.colorId}|${r.size}`).sort()
    const expected = [c1.id, c2.id]
      .flatMap((cid) => ['S', 'M', 'L'].map((sz) => `${cid}|${sz}`))
      .sort()
    expect(pairs).toEqual(expected)
  })

  it('is idempotent — re-running with the same input is a no-op', async () => {
    const [item] = await db
      .insert(items)
      .values({
        articleNumber: `${ART}-b`,
        name: 'materialize tester B',
        category: 'Test',
      })
      .returning()
    createdItemIds.push(item.id)

    const [c1] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Green', colorHex: '#00ff00' })
      .returning()

    await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [c1.id],
      sizes: ['S', 'M'],
    })

    const second = await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [c1.id],
      sizes: ['S', 'M'],
    })

    expect(second.inserted).toBe(0)
    expect(second.skipped).toBe(2)

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, item.id))
    expect(rows).toHaveLength(2)
  })

  it('only inserts the missing pairs when re-run with new colors', async () => {
    const [item] = await db
      .insert(items)
      .values({
        articleNumber: `${ART}-c`,
        name: 'materialize tester C',
        category: 'Test',
      })
      .returning()
    createdItemIds.push(item.id)

    const [c1] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Yellow', colorHex: '#ffff00' })
      .returning()

    await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [c1.id],
      sizes: ['S', 'M'],
    })

    const [c2] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Purple', colorHex: '#800080' })
      .returning()

    const result = await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [c1.id, c2.id],
      sizes: ['S', 'M'],
    })

    // Re-uses the 2 (c1, S/M) rows; inserts the 2 new (c2, S/M) rows.
    expect(result.inserted).toBe(2)
    expect(result.skipped).toBe(2)

    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, item.id))
    expect(rows).toHaveLength(4)
  })

  it('returns 0 inserted when colorIds or sizes is empty', async () => {
    const [item] = await db
      .insert(items)
      .values({
        articleNumber: `${ART}-d`,
        name: 'materialize tester D',
        category: 'Test',
      })
      .returning()
    createdItemIds.push(item.id)

    const empty = await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [],
      sizes: ['S'],
    })
    expect(empty.inserted).toBe(0)
    expect(empty.skipped).toBe(0)

    const empty2 = await materializeVariantsFromColorsSizes({
      itemId: item.id,
      colorIds: [],
      sizes: [],
    })
    expect(empty2.inserted).toBe(0)
    expect(empty2.skipped).toBe(0)
  })
})
