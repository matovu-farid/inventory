/**
 * Task 3 (variant-flexibility Plan 1):
 * `setItemMinimumSellPrice` writes `items.minimum_sell_price_ugx` —
 * replacing the per-stock-row `setMinimumSellPrice` server fn that
 * lived in `store/receiving.ts` before the column was dropped from
 * `store_stock` in Task 2.
 *
 * Pattern follows other server-fn tests (create-item-materializes-
 * variants.test.ts): mock auth/rbac, wrap calls in
 * runWithStartContext, then read the DB to verify side effects.
 */
import { describe, it, expect, afterAll, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { runWithStartContext } from '@tanstack/start-storage-context'

import { db } from '#/db'
import {
  items,
  itemArticleNumbers,
  shopStock,
  shops,
  suppliers,
} from '#/db/schema'
import {
  setItemMinimumSellPrice,
  updateItemCommercialProfile,
} from '#/server/functions/items/prices'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000c8'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({ user: { id: TEST_USER_ID, role: 'admin' } }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
  requireSessionAndRole: () =>
    Promise.resolve({
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
const createdItemIds: string[] = []
const createdStockIds: string[] = []
const createdShopIds: string[] = []
const createdSupplierIds: string[] = []

afterAll(async () => {
  if (createdStockIds.length > 0) {
    await db.delete(shopStock).where(inArray(shopStock.id, createdStockIds))
  }
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
  if (createdSupplierIds.length > 0) {
    await db.delete(suppliers).where(inArray(suppliers.id, createdSupplierIds))
  }
  if (createdShopIds.length > 0) {
    await db.delete(shops).where(inArray(shops.id, createdShopIds))
  }
})

describe('setItemMinimumSellPrice', () => {
  it("updates the item's minimum_sell_price_ugx", async () => {
    const inserted = await db
      .insert(items)
      .values({
        name: 'Min-price tester',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: inserted[0].id, articleNumber: `simsp-${SUFFIX}-a` })
    const itemId = inserted[0]?.id
    if (!itemId) throw new Error('seed failed')
    createdItemIds.push(itemId)

    await callServerFn(() =>
      setItemMinimumSellPrice({
        data: { itemId, minimumSellPriceUgx: '12500.00' },
      }),
    )

    const row = await db.query.items.findFirst({
      where: eq(items.id, itemId),
    })
    expect(row?.minimumSellPriceUgx).toBe('12500.00')
  })

  it('throws if item does not exist', async () => {
    await expect(
      callServerFn(() =>
        setItemMinimumSellPrice({
          data: {
            itemId: '00000000-0000-0000-0000-000000000000',
            minimumSellPriceUgx: '0',
          },
        }),
      ),
    ).rejects.toThrow()
  })

  it('does not rewrite commercial snapshots on stock already on hand', async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({ name: `Snapshot supplier ${SUFFIX}`, type: 'local' })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Snapshot shop ${SUFFIX}` })
      .returning()
    const [inserted] = await db
      .insert(items)
      .values({
        name: 'Snapshot tester',
        design: 'Test',
        supplierId: supplier.id,
        costPrice: '100.00',
        costCurrency: 'RMB',
        minimumSellPriceUgx: '12500.00',
      })
      .returning()
    const [stock] = await db
      .insert(shopStock)
      .values({
        shopId: shop.id,
        itemId: inserted.id,
        variantId: null,
        supplyRouteLineId: null,
        quantityOnHand: 4,
        costPerUnitUgx: '370000.00',
        minimumSellPriceUgx: '12500.00',
      })
      .returning()
    createdSupplierIds.push(supplier.id)
    createdShopIds.push(shop.id)
    createdItemIds.push(inserted.id)
    createdStockIds.push(stock.id)

    await callServerFn(() =>
      setItemMinimumSellPrice({
        data: { itemId: inserted.id, minimumSellPriceUgx: '15000.00' },
      }),
    )
    await callServerFn(() =>
      updateItemCommercialProfile({
        data: {
          itemId: inserted.id,
          supplierId: supplier.id,
          costPrice: '110.00',
          costCurrency: 'RMB',
          minimumSellPriceUgx: '16000.00',
        },
      }),
    )

    const unchanged = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, stock.id),
    })
    expect(unchanged).toMatchObject({
      quantityOnHand: 4,
      costPerUnitUgx: '370000.00',
      minimumSellPriceUgx: '12500.00',
    })
  })
})
