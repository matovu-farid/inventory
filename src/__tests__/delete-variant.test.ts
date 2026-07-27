import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { runWithStartContext } from '@tanstack/start-storage-context'

import { db } from '#/db'
import { items, itemColors, variants, storeStock, stores } from '#/db/schema'
import { createVariant, deleteVariant } from '#/server/functions/items/variants'
import { assertDefined } from './test-helpers'

/**
 * Issue #7 acceptance #3: deleting a variant must be blocked by FK
 * restrict if stock / sales reference it, and the server function should
 * surface a clean, user-readable error (not the raw pg SQLSTATE).
 *
 * `variants.color_id` has `onDelete: 'restrict'`, and `shop_stock.variant_id`
 * / `store_stock.variant_id` reference variants with FK restrict too — so
 * the underlying constraint already does the right thing at the DB layer.
 * Here we just verify the server wrapper converts the violation into a
 * friendly error and that the happy path (variant has no stock) succeeds.
 */

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000d7'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({ user: { id: TEST_USER_ID, role: 'admin' } }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
  requireSessionAndRole: () => Promise.resolve({
    user: { id: TEST_USER_ID, role: 'admin' },
  }),
}))

const stubStartContext = {
  getRouter: (() => {
    throw new Error('router not available in tests')
  }) as never,
  request: new Request('http://localhost/test'),
  startOptions: { functionMiddleware: [] },
  contextAfterGlobalMiddlewares: {},
  executedRequestMiddlewares: new Set(),
  handlerType: 'serverFn' as const,
}
function callServerFn<T>(fn: () => Promise<T>): Promise<T> {
  return runWithStartContext(stubStartContext, fn)
}

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const FIXTURE: {
  itemId?: string
  colorId?: string
  variantWithStockId?: string
  variantWithoutStockId?: string
  storeId?: string
} = {}

function itemId(): string {
  assertDefined(FIXTURE.itemId, 'FIXTURE.itemId not seeded')
  return FIXTURE.itemId
}
function colorId(): string {
  assertDefined(FIXTURE.colorId, 'FIXTURE.colorId not seeded')
  return FIXTURE.colorId
}
function variantWithStockId(): string {
  assertDefined(
    FIXTURE.variantWithStockId,
    'FIXTURE.variantWithStockId not seeded',
  )
  return FIXTURE.variantWithStockId
}
function variantWithoutStockId(): string {
  assertDefined(
    FIXTURE.variantWithoutStockId,
    'FIXTURE.variantWithoutStockId not seeded',
  )
  return FIXTURE.variantWithoutStockId
}

beforeAll(async () => {
  const [item] = await db
    .insert(items)
    .values({
      articleNumber: `dv-${SUFFIX}`,
      name: 'delete-variant tester',
      category: 'Test',
    })
    .returning()
  FIXTURE.itemId = item.id

  const [color] = await db
    .insert(itemColors)
    .values({ itemId: item.id, colorName: 'Maroon', colorHex: '#800020' })
    .returning()
  FIXTURE.colorId = color.id

  const [vStock, vFree] = await db
    .insert(variants)
    .values([
      { itemId: item.id, colorId: color.id, size: 'M' },
      { itemId: item.id, colorId: color.id, size: 'L' },
    ])
    .returning()
  FIXTURE.variantWithStockId = vStock.id
  FIXTURE.variantWithoutStockId = vFree.id

  let existingStore = await db.query.stores.findFirst()
  if (!existingStore) {
    ;[existingStore] = await db
      .insert(stores)
      .values({ name: `DV Store ${SUFFIX}` })
      .returning()
  }
  FIXTURE.storeId = existingStore.id

  await db.insert(storeStock).values({
    storeId: existingStore.id,
    itemId: item.id,
    variantId: vStock.id,
    quantityOnHand: 5,
    costPerUnitUgx: '100',
  })
})

// Cleanup runs once at the end; ordering matters because store_stock
// holds a FK restrict on variants, and variants on items via cascade.
afterAll(async () => {
  if (FIXTURE.storeId && FIXTURE.variantWithStockId) {
    await db
      .delete(storeStock)
      .where(
        and(
          eq(storeStock.storeId, FIXTURE.storeId),
          eq(storeStock.variantId, FIXTURE.variantWithStockId),
        ),
      )
  }
  if (FIXTURE.itemId) {
    // Drop dependent variant rows first explicitly — afterAll's last
    // suite invocation runs in unspecified order so don't rely on the
    // schema cascade timing.
    await db.delete(variants).where(inArray(variants.itemId, [FIXTURE.itemId]))
    await db.delete(items).where(eq(items.id, FIXTURE.itemId))
  }
})

describe('createVariant', () => {
  it('inserts a new (color, size) pair for the item', async () => {
    await callServerFn(() =>
      createVariant({
        data: {
          itemId: itemId(),
          colorId: colorId(),
          size: 'XL',
        },
      }),
    )
    // createServerFn's wrapper swallows return values outside SSR (see
    // item-categories.test.ts), so verify the row landed by reading
    // straight from the DB.
    const row = await db.query.variants.findFirst({
      where: and(
        eq(variants.itemId, itemId()),
        eq(variants.colorId, colorId()),
        eq(variants.size, 'XL'),
      ),
    })
    expect(row).toBeDefined()
    expect(row?.itemId).toBe(itemId())
    expect(row?.colorId).toBe(colorId())
    expect(row?.size).toBe('XL')

    // Cleanup so afterAll cascade is clean.
    if (row) {
      await db.delete(variants).where(eq(variants.id, row.id))
    }
  })

  it('rejects a duplicate (item, color, size) combination', async () => {
    await expect(
      callServerFn(() =>
        createVariant({
          data: {
            itemId: itemId(),
            colorId: colorId(),
            size: 'M',
          },
        }),
      ),
    ).rejects.toThrow(/already exists|duplicate|unique/i)
  })
})

describe('deleteVariant', () => {
  it('deletes a variant that has no stock referencing it', async () => {
    await callServerFn(() =>
      deleteVariant({ data: { variantId: variantWithoutStockId() } }),
    )
    const rows = await db
      .select()
      .from(variants)
      .where(eq(variants.id, variantWithoutStockId()))
    expect(rows).toHaveLength(0)
  })

  it('surfaces a friendly error when stock references the variant', async () => {
    // The variant referenced by storeStock cannot be deleted — FK restrict
    // on storeStock.variantId blocks it. The server fn should map the
    // pg constraint violation to a human-readable message.
    await expect(
      callServerFn(() =>
        deleteVariant({ data: { variantId: variantWithStockId() } }),
      ),
    ).rejects.toThrow(/in use|cannot be deleted|stock|referenced/i)

    // Confirm the row is still there.
    const stillThere = await db
      .select()
      .from(variants)
      .where(eq(variants.id, variantWithStockId()))
    expect(stillThere).toHaveLength(1)
  })
})
