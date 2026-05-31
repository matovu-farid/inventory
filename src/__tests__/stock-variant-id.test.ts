import { describe, it, expect, afterAll } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'

import { db } from '#/db'
import {
  items,
  itemColors,
  variants,
  shops,
  stores,
  shopStock,
  storeStock,
} from '#/db/schema'

/**
 * Migration-level acceptance tests for issue #4
 * (refactor(stock): swap (product_color_id, size) → variant_id on
 * shop_stock, store_stock).
 *
 * Pattern mirrors src/__tests__/items-rename.test.ts and
 * src/__tests__/variants.test.ts — each test creates the rows it needs
 * and cleans them up in afterAll. These tests assume `pnpm db:push:test`
 * has applied the variant_id swap on both stock tables.
 */

const PG_UNIQUE_VIOLATION = '23505'
const PG_NOT_NULL_VIOLATION = '23502'

async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause
    return cause?.code
  }
}

const SUFFIX = `${Date.now()}`
const ART = `stock-var-${SUFFIX}`

const createdItemIds: string[] = []
const createdStoreIds: string[] = []
const createdShopIds: string[] = []

afterAll(async () => {
  if (createdStoreIds.length > 0) {
    await db
      .delete(storeStock)
      .where(inArray(storeStock.storeId, createdStoreIds))
    await db.delete(stores).where(inArray(stores.id, createdStoreIds))
  }
  if (createdShopIds.length > 0) {
    await db.delete(shopStock).where(inArray(shopStock.shopId, createdShopIds))
    await db.delete(shops).where(inArray(shops.id, createdShopIds))
  }
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
})

interface VariantFixture {
  itemId: string
  colorId: string
  variantId: string
  shopId: string
  storeId: string
}

async function seedVariantFixture(label: string): Promise<VariantFixture> {
  const [item] = await db
    .insert(items)
    .values({
      articleNumber: `${ART}-${label}`,
      name: `stock-variant-${label}`,
      category: 'Test',
    })
    .returning()
  createdItemIds.push(item.id)

  const [color] = await db
    .insert(itemColors)
    .values({ itemId: item.id, colorName: 'Indigo', colorHex: '#2a3a8b' })
    .returning()

  const [variant] = await db
    .insert(variants)
    .values({ itemId: item.id, colorId: color.id, size: 'S' })
    .returning()

  const [shop] = await db
    .insert(shops)
    .values({ name: `stock-var-shop-${label}-${SUFFIX}` })
    .returning()
  createdShopIds.push(shop.id)

  const [store] = await db
    .insert(stores)
    .values({ name: `stock-var-store-${label}-${SUFFIX}` })
    .returning()
  createdStoreIds.push(store.id)

  return {
    itemId: item.id,
    colorId: color.id,
    variantId: variant.id,
    shopId: shop.id,
    storeId: store.id,
  }
}

describe('shop_stock — variant_id swap', () => {
  it('schema column shape: variant_id exists, product_color_id and size are gone', async () => {
    const rows = await db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'shop_stock'
    `)
    const cols = new Set(
      (Array.isArray(rows)
        ? rows
        : ((rows as { rows?: { column_name: string }[] }).rows ?? [])
      ).map((r) => r.column_name),
    )
    expect(cols.has('variant_id')).toBe(true)
    expect(cols.has('product_color_id')).toBe(false)
    expect(cols.has('size')).toBe(false)
  })

  it('inserts a shop_stock row with variant_id and reads it back via the variant relation', async () => {
    const fx = await seedVariantFixture('shop-insert')

    const [stock] = await db
      .insert(shopStock)
      .values({
        shopId: fx.shopId,
        variantId: fx.variantId,
        quantityOnHand: 7,
        costPerUnitUgx: '1000.00',
        minimumSellPriceUgx: '1500.00',
      })
      .returning()
    expect(stock.variantId).toBe(fx.variantId)

    const fetched = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, stock.id),
      with: { variant: { with: { color: true } } },
    })
    expect(fetched?.variant.id).toBe(fx.variantId)
    expect(fetched?.variant.color.id).toBe(fx.colorId)
    expect(fetched?.variant.size).toBe('S')
  })

  it('unique(shop_id, variant_id) rejects a duplicate insert', async () => {
    const fx = await seedVariantFixture('shop-uq')
    await db.insert(shopStock).values({
      shopId: fx.shopId,
      variantId: fx.variantId,
      quantityOnHand: 1,
      costPerUnitUgx: '1.00',
      minimumSellPriceUgx: '1.00',
    })
    const code = await pgErrorCode(
      db.insert(shopStock).values({
        shopId: fx.shopId,
        variantId: fx.variantId,
        quantityOnHand: 2,
        costPerUnitUgx: '1.00',
        minimumSellPriceUgx: '1.00',
      }),
    )
    expect(code).toBe(PG_UNIQUE_VIOLATION)
  })

  it('variant_id is NOT NULL', async () => {
    const fx = await seedVariantFixture('shop-nn')
    const code = await pgErrorCode(
      db.execute(sql`
        INSERT INTO shop_stock
          (shop_id, variant_id, quantity_on_hand, cost_per_unit_ugx, minimum_sell_price_ugx)
        VALUES (${fx.shopId}::uuid, NULL, 0, '1', '1')
      `),
    )
    expect(code).toBe(PG_NOT_NULL_VIOLATION)
  })
})

describe('store_stock — variant_id swap', () => {
  it('schema column shape: variant_id exists, product_color_id and size are gone', async () => {
    const rows = await db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'store_stock'
    `)
    const cols = new Set(
      (Array.isArray(rows)
        ? rows
        : ((rows as { rows?: { column_name: string }[] }).rows ?? [])
      ).map((r) => r.column_name),
    )
    expect(cols.has('variant_id')).toBe(true)
    expect(cols.has('product_color_id')).toBe(false)
    expect(cols.has('size')).toBe(false)
  })

  it('inserts a store_stock row with variant_id and reads it back via the variant relation', async () => {
    const fx = await seedVariantFixture('store-insert')

    const [stock] = await db
      .insert(storeStock)
      .values({
        storeId: fx.storeId,
        itemId: fx.itemId,
        variantId: fx.variantId,
        quantityOnHand: 12,
        costPerUnitUgx: '500.00',
      })
      .returning()
    expect(stock.variantId).toBe(fx.variantId)

    const fetched = await db.query.storeStock.findFirst({
      where: eq(storeStock.id, stock.id),
      with: { variant: { with: { color: true } } },
    })
    expect(fetched?.variant?.id).toBe(fx.variantId)
    expect(fetched?.variant?.color.id).toBe(fx.colorId)
    expect(fetched?.variant?.size).toBe('S')
  })

  it('unique(store_id, item_id, variant_id, supply_route_line_id) rejects a duplicate insert', async () => {
    const fx = await seedVariantFixture('store-uq')
    await db.insert(storeStock).values({
      storeId: fx.storeId,
      itemId: fx.itemId,
      variantId: fx.variantId,
      quantityOnHand: 1,
      costPerUnitUgx: '1.00',
    })
    const code = await pgErrorCode(
      db.insert(storeStock).values({
        storeId: fx.storeId,
        itemId: fx.itemId,
        variantId: fx.variantId,
        quantityOnHand: 2,
        costPerUnitUgx: '1.00',
      }),
    )
    expect(code).toBe(PG_UNIQUE_VIOLATION)
  })

  it('variant_id is NULLABLE — unresolved stock lands as variant_id NULL with item_id set', async () => {
    const fx = await seedVariantFixture('store-nullable')
    const [row] = await db
      .insert(storeStock)
      .values({
        storeId: fx.storeId,
        itemId: fx.itemId,
        variantId: null,
        quantityOnHand: 4,
        costPerUnitUgx: '1.00',
      })
      .returning()
    expect(row.variantId).toBeNull()
    expect(row.itemId).toBe(fx.itemId)
  })
})
