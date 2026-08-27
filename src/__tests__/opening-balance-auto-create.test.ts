import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import {
  auditLogs,
  itemColors,
  itemArticleNumbers,
  items,
  shopStock,
  shops,
  storeStock,
  stores,
  transactionCategories,
  transactions,
  user,
  variants,
} from '#/db/schema'
import {
  addShopOpeningBalance,
  addStoreOpeningBalance,
} from '#/server/functions/admin/opening-balance'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000ad'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: 'admin' },
    }),
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

const REQUIRED_CATEGORIES = [
  { name: 'Inventory - Store', type: 'asset' as const },
  { name: 'Inventory - Shop', type: 'asset' as const },
  { name: "Owner's Equity", type: 'equity' as const },
]

beforeAll(async () => {
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: 'Test Admin Auto OB',
      email: `test-admin-${TEST_USER_ID}@example.com`,
      emailVerified: true,
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe('addShopOpeningBalance — auto-create variant from colorId+size', () => {
  it('materialises missing (color, size) variants and posts stock', async () => {
    const suffix = Date.now()
    const [item] = await db
      .insert(items)
      .values({
        name: 'T shirt',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: item.id, articleNumber: `OB-AC-${suffix}` })
    const [royal] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Royal', colorHex: '#4169e1' })
      .returning()
    const [black] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Black', colorHex: '#000000' })
      .returning()
    const [blackM] = await db
      .insert(variants)
      .values({ itemId: item.id, colorId: black.id, size: 'M' })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Auto OB Shop ${suffix}` })
      .returning()

    await callServerFn(() =>
      addShopOpeningBalance({
        data: {
          shopId: shop.id,
          items: [
            {
              itemId: item.id,
              unitCostUgx: '30000.00',
              cells: [
                { colorId: royal.id, size: 'M', quantity: 40 },
                { colorId: black.id, size: 'M', quantity: 20 },
              ],
            },
          ],
        },
      }),
    )

    const royalM = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, royal.id), eq(variants.size, 'M')),
    })
    expect(royalM).toBeDefined()

    const stockRows = await db.query.shopStock.findMany({
      where: eq(shopStock.shopId, shop.id),
    })
    expect(stockRows).toHaveLength(2)
    expect(stockRows.map((r) => r.quantityOnHand).sort()).toEqual([20, 40])

    await db.delete(shopStock).where(eq(shopStock.shopId, shop.id))
    await db.delete(shops).where(eq(shops.id, shop.id))
    if (!royalM) throw new Error('royal M variant not created')
    await db
      .delete(variants)
      .where(inArray(variants.id, [blackM.id, royalM.id]))
    await db
      .delete(itemColors)
      .where(inArray(itemColors.id, [royal.id, black.id]))
    await db.delete(items).where(eq(items.id, item.id))
  })

  it('rejects colorId that belongs to a different item', async () => {
    const suffix = Date.now()
    const [itemA] = await db
      .insert(items)
      .values({
        name: 'Item A',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: itemA.id, articleNumber: `OB-A-${suffix}` })
    const [itemB] = await db
      .insert(items)
      .values({
        name: 'Item B',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: itemB.id, articleNumber: `OB-B-${suffix}` })
    const [colorB] = await db
      .insert(itemColors)
      .values({ itemId: itemB.id, colorName: 'Navy', colorHex: '#000080' })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Auto OB Shop reject ${suffix}` })
      .returning()

    await expect(
      callServerFn(() =>
        addShopOpeningBalance({
          data: {
            shopId: shop.id,
            items: [
              {
                itemId: itemA.id,
                unitCostUgx: '1000.00',
                cells: [{ colorId: colorB.id, size: 'M', quantity: 5 }],
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow(/does not belong/i)

    await db.delete(shops).where(eq(shops.id, shop.id))
    await db.delete(itemColors).where(eq(itemColors.id, colorB.id))
    await db.delete(items).where(inArray(items.id, [itemA.id, itemB.id]))
  })

  it('rejects variantId that belongs to a different item', async () => {
    const suffix = Date.now()
    const [itemA] = await db
      .insert(items)
      .values({
        name: 'Item A',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: itemA.id, articleNumber: `OB-VA-${suffix}` })
    const [itemB] = await db
      .insert(items)
      .values({
        name: 'Item B',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: itemB.id, articleNumber: `OB-VB-${suffix}` })
    const [colorB] = await db
      .insert(itemColors)
      .values({ itemId: itemB.id, colorName: 'Navy', colorHex: '#000080' })
      .returning()
    const [variantB] = await db
      .insert(variants)
      .values({ itemId: itemB.id, colorId: colorB.id, size: 'M' })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Auto OB Shop v reject ${suffix}` })
      .returning()

    await expect(
      callServerFn(() =>
        addShopOpeningBalance({
          data: {
            shopId: shop.id,
            items: [
              {
                itemId: itemA.id,
                unitCostUgx: '1000.00',
                cells: [{ variantId: variantB.id, quantity: 5 }],
              },
            ],
          },
        }),
      ),
    ).rejects.toThrow(/Variant.*does not belong/i)

    await db.delete(shops).where(eq(shops.id, shop.id))
    await db.delete(variants).where(eq(variants.id, variantB.id))
    await db.delete(itemColors).where(eq(itemColors.id, colorB.id))
    await db.delete(items).where(inArray(items.id, [itemA.id, itemB.id]))
  })

  it('writes audit metadata with colorName and size for auto-created variants', async () => {
    const suffix = Date.now()
    const [item] = await db
      .insert(items)
      .values({
        name: 'T shirt',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: item.id, articleNumber: `OB-AUD-${suffix}` })
    const [royal] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Royal', colorHex: '#4169e1' })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Auto OB Audit ${suffix}` })
      .returning()

    await callServerFn(() =>
      addShopOpeningBalance({
        data: {
          shopId: shop.id,
          items: [
            {
              itemId: item.id,
              unitCostUgx: '30000.00',
              cells: [{ colorId: royal.id, size: 'M', quantity: 10 }],
            },
          ],
        },
      }),
    )

    const log = await db.query.auditLogs.findFirst({
      where: and(
        eq(auditLogs.actorUserId, TEST_USER_ID),
        eq(auditLogs.action, 'openingBalance.shop'),
      ),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    })
    expect(log).toBeDefined()
    if (!log) throw new Error('opening balance audit log not created')
    const lines = (
      log.metadata as {
        lines: Array<{ colorName: string | null; size: string | null }>
      }
    ).lines
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ colorName: 'Royal', size: 'M' }),
      ]),
    )

    const royalM = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, royal.id), eq(variants.size, 'M')),
    })

    await db.delete(shopStock).where(eq(shopStock.shopId, shop.id))
    await db.delete(shops).where(eq(shops.id, shop.id))
    if (royalM) await db.delete(variants).where(eq(variants.id, royalM.id))
    await db.delete(itemColors).where(eq(itemColors.id, royal.id))
    await db.delete(items).where(eq(items.id, item.id))
  })
})

describe('addStoreOpeningBalance — auto-create variant from colorId+size', () => {
  it('creates a catalog item from a free-text design and art number on save', async () => {
    const suffix = Date.now()
    await db
      .insert(stores)
      .values({ name: `Free text store ${suffix}` })
      .onConflictDoNothing()
    const store = await db.query.stores.findFirst()
    if (!store) throw new Error('store not seeded')

    const articleNumber = `OB-FREE-${suffix}`
    const design = `Free text design ${suffix}`
    await callServerFn(() =>
      addStoreOpeningBalance({
        data: {
          items: [
            {
              itemId: null,
              itemName: 'Free Text Shirt',
              design,
              articleNumber,
              unitCostUgx: '12500.00',
              minimumSellPriceUgx: '22000.00',
              lowStockThreshold: 3,
              cells: [
                {
                  colorText: 'Coral',
                  colorHexText: '#ff7f50',
                  size: 'M',
                  quantity: 9,
                },
              ],
            },
          ],
        },
      }),
    )

    const created = await db.query.items.findFirst({
      where: eq(items.design, design),
    })
    expect(created).toBeDefined()
    if (!created) throw new Error('free-text item was not created')
    expect(created.name).toBe('Free Text Shirt')
    expect(created.supplierId).toBeNull()
    expect(created.minimumSellPriceUgx).toBe('22000.00')
    expect(created.lowStockThreshold).toBe(3)

    const article = await db.query.itemArticleNumbers.findFirst({
      where: and(
        eq(itemArticleNumbers.itemId, created.id),
        eq(itemArticleNumbers.articleNumber, articleNumber),
      ),
    })
    expect(article).toBeDefined()

    const color = await db.query.itemColors.findFirst({
      where: and(
        eq(itemColors.itemId, created.id),
        eq(itemColors.colorName, 'Coral'),
      ),
    })
    expect(color?.colorHex).toBe('#ff7f50')
    if (!color) throw new Error('free-text color was not created')

    const variant = await db.query.variants.findFirst({
      where: and(
        eq(variants.itemId, created.id),
        eq(variants.colorId, color.id),
        eq(variants.size, 'M'),
      ),
    })
    expect(variant).toBeDefined()
    if (!variant) throw new Error('free-text variant was not created')

    const stock = await db.query.storeStock.findFirst({
      where: and(
        eq(storeStock.storeId, store.id),
        eq(storeStock.itemId, created.id),
        eq(storeStock.variantId, variant.id),
      ),
    })
    expect(stock?.quantityOnHand).toBe(9)
    expect(stock?.costPerUnitUgx).toBe('12500.00')
    expect(stock?.minimumSellPriceUgx).toBe('22000.00')

    await db.delete(storeStock).where(eq(storeStock.itemId, created.id))
    await db.delete(items).where(eq(items.id, created.id))
  })

  it('materialises missing variant on store opening balance', async () => {
    const suffix = Date.now()
    const [item] = await db
      .insert(items)
      .values({
        name: 'T shirt',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: item.id, articleNumber: `OB-ST-${suffix}` })
    const [royal] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Royal', colorHex: '#4169e1' })
      .returning()
    await db
      .insert(stores)
      .values({ name: `Store ${suffix}` })
      .onConflictDoNothing()
    const store = await db.query.stores.findFirst()
    if (!store) throw new Error('store not seeded')

    await callServerFn(() =>
      addStoreOpeningBalance({
        data: {
          items: [
            {
              itemId: item.id,
              unitCostUgx: '30000.00',
              cells: [{ colorId: royal.id, size: 'M', quantity: 15 }],
            },
          ],
        },
      }),
    )

    const royalM = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, royal.id), eq(variants.size, 'M')),
    })
    expect(royalM).toBeDefined()
    if (!royalM) throw new Error('royal M variant not created')

    const stockRows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.storeId, store.id),
        eq(storeStock.variantId, royalM.id),
      ),
    })
    expect(stockRows).toHaveLength(1)
    expect(stockRows[0].quantityOnHand).toBe(15)

    await db.delete(storeStock).where(eq(storeStock.variantId, royalM.id))
    await db.delete(variants).where(eq(variants.id, royalM.id))
    await db.delete(itemColors).where(eq(itemColors.id, royal.id))
    await db.delete(items).where(eq(items.id, item.id))
  })

  it('uses row commercial values for the stock snapshot and item threshold', async () => {
    const suffix = Date.now()
    const [item] = await db
      .insert(items)
      .values({
        name: 'Opening balance commercial values',
        design: 'Test',
      })
      .returning()
    await db
      .insert(itemArticleNumbers)
      .values({ itemId: item.id, articleNumber: `OB-CV-${suffix}` })
    const [color] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: 'Navy', colorHex: '#000080' })
      .returning()
    await db
      .insert(stores)
      .values({ name: `Commercial values store ${suffix}` })
      .onConflictDoNothing()
    const store = await db.query.stores.findFirst()
    if (!store) throw new Error('store not seeded')

    await callServerFn(() =>
      addStoreOpeningBalance({
        data: {
          items: [
            {
              itemId: item.id,
              unitCostUgx: '12500.00',
              minimumSellPriceUgx: '22000.00',
              lowStockThreshold: 7,
              cells: [{ colorId: color.id, size: 'L', quantity: 12 }],
            },
          ],
        },
      }),
    )

    const updatedItem = await db.query.items.findFirst({
      where: eq(items.id, item.id),
    })
    expect(updatedItem?.minimumSellPriceUgx).toBe('22000.00')
    expect(updatedItem?.lowStockThreshold).toBe(7)

    const variant = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, color.id), eq(variants.size, 'L')),
    })
    if (!variant) throw new Error('variant not created')
    const stockRow = await db.query.storeStock.findFirst({
      where: and(
        eq(storeStock.storeId, store.id),
        eq(storeStock.variantId, variant.id),
      ),
    })
    expect(stockRow?.costPerUnitUgx).toBe('12500.00')
    expect(stockRow?.minimumSellPriceUgx).toBe('22000.00')

    await db.delete(storeStock).where(eq(storeStock.variantId, variant.id))
    await db.delete(variants).where(eq(variants.id, variant.id))
    await db.delete(itemColors).where(eq(itemColors.id, color.id))
    await db.delete(items).where(eq(items.id, item.id))
  })
})
