/**
 * Plan 2b Task 6 — `recordSale` accepts item-level input
 * (`{ itemId, variantId?, quantity, unitPriceUgx }`) and uses
 * `pickShopStockFifo` to plan a per-source allocation across
 * `shop_stock` rows.
 *
 * Mirrors the structure of `create-transfer-item-level.test.ts`.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db'
import {
  shopSales,
  shopSaleLines,
  shopSaleLineAllocations,
  shopStock,
  transactionCategories,
  transactions,
  auditLogs,
  user,
} from '#/db/schema'
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedShop,
  seedSupplyRouteLine,
  seedShopStockLot,
} from './test-helpers'

const TEST_USER_ID = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`
const session = {
  user: { id: TEST_USER_ID, role: 'admin' as 'admin' | 'supervisor' | 'sales' },
}

vi.mock('#/server/middleware/auth', () => ({
  requireSession: () => Promise.resolve(session),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: (sess: { user: { role: string } }, roles: string[]) => {
    if (!roles.includes(sess.user.role)) {
      throw new Error(
        `Forbidden: role ${sess.user.role} not in ${roles.join(',')}`,
      )
    }
  },
  hasRole: (sess: { user: { role: string } }, roles: string[]) =>
    roles.includes(sess.user.role),
  requireSessionAndRole: () => Promise.resolve(session),
}))

const { recordSale } = await import('#/server/functions/shop/sales')

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
  { name: 'Cash', type: 'asset' as const },
  { name: 'Bank', type: 'asset' as const },
  { name: 'Sales Revenue', type: 'revenue' as const },
  { name: 'Cost of Goods Sold', type: 'expense' as const },
  { name: 'Inventory - Shop', type: 'asset' as const },
  { name: 'Accounts Receivable', type: 'asset' as const },
]

async function reseedUser() {
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: 'Test Admin',
      email: `test-sale6-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: 'admin',
    })
    .onConflictDoNothing()
}

async function reseedCategories() {
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
}

beforeAll(async () => {
  await reseedCategories()
  await reseedUser()
})

afterAll(async () => {
  await resetTestDb()
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

beforeEach(async () => {
  await resetTestDb()
  await reseedUser()
  await reseedCategories()
})

describe('recordSale — item-level FIFO', () => {
  it('sells from an unresolved lot and writes allocations', async () => {
    const itemId = await seedItem({
      articleNumber: 'S-1',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: lineId,
      quantity: 5,
      costPerUnitUgx: '60.00',
    })

    await callServerFn(() =>
      recordSale({
        data: {
          shopId,
          paymentMethod: 'cash',
          items: [{ itemId, quantity: 3, unitPriceUgx: '150.00' }],
        },
      }),
    )

    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error('Sale not persisted')

    const lines = await db.query.shopSaleLines.findMany({
      where: eq(shopSaleLines.shopSaleId, sale.id),
    })
    expect(lines).toHaveLength(1)
    const line = lines[0]
    expect(line.itemId).toBe(itemId)
    expect(line.variantId).toBeNull()
    expect(line.shopStockId).toBeNull()
    expect(line.quantity).toBe(3)
    expect(line.unitPriceUgx).toBe('150.00')
    expect(line.minimumPriceUgx).toBe('100.00')

    const allocs = await db.query.shopSaleLineAllocations.findMany({
      where: eq(shopSaleLineAllocations.shopSaleLineId, line.id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].quantity).toBe(3)
    expect(allocs[0].costPerUnitUgx).toBe('60.00')

    const lots = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(lots.reduce((s, l) => s + l.quantityOnHand, 0)).toBe(2)
  })

  it('drains unresolved-first then variant lots when variantId omitted', async () => {
    const itemId = await seedItem({
      articleNumber: 'S-2',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const colorId = await seedColor({
      itemId,
      colorName: 'Red',
      colorHex: '#f00',
    })
    const shopId = await seedShop()
    const oldVariantLine = await seedSupplyRouteLine({
      itemId,
      colorId,
      size: 'M',
      createdAt: '2026-01-01',
    })
    const newUnresolvedLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: '2026-03-01',
    })
    await seedShopStockLot({
      shopId,
      itemId,
      colorId,
      size: 'M',
      supplyRouteLineId: oldVariantLine,
      quantity: 4,
      costPerUnitUgx: '60.00',
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: newUnresolvedLine,
      quantity: 3,
      costPerUnitUgx: '70.00',
    })

    await callServerFn(() =>
      recordSale({
        data: {
          shopId,
          paymentMethod: 'cash',
          items: [{ itemId, quantity: 5, unitPriceUgx: '150.00' }],
        },
      }),
    )

    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error('Sale not persisted')
    const lines = await db.query.shopSaleLines.findMany({
      where: eq(shopSaleLines.shopSaleId, sale.id),
    })
    expect(lines).toHaveLength(1)
    const allocs = await db.query.shopSaleLineAllocations.findMany({
      where: eq(shopSaleLineAllocations.shopSaleLineId, lines[0].id),
    })
    expect(allocs).toHaveLength(2)
    // Unresolved drained first (3), then variant (2).
    const sorted = [...allocs].sort((a, b) => a.quantity - b.quantity)
    expect(sorted.map((a) => a.quantity)).toEqual([2, 3])
  })

  it("variantId-scoped sale only draws from that variant's lots", async () => {
    const itemId = await seedItem({
      articleNumber: 'S-3',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const colorId = await seedColor({
      itemId,
      colorName: 'Red',
      colorHex: '#f00',
    })
    const shopId = await seedShop()
    const vLine = await seedSupplyRouteLine({ itemId, colorId, size: 'M' })
    const uLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    const { variantId } = await seedShopStockLot({
      shopId,
      itemId,
      colorId,
      size: 'M',
      supplyRouteLineId: vLine,
      quantity: 5,
      costPerUnitUgx: '60.00',
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: uLine,
      quantity: 10,
      costPerUnitUgx: '70.00',
    })
    if (!variantId) throw new Error('variant seed failed')

    await callServerFn(() =>
      recordSale({
        data: {
          shopId,
          paymentMethod: 'cash',
          items: [{ itemId, variantId, quantity: 3, unitPriceUgx: '150.00' }],
        },
      }),
    )

    const lines = await db.query.shopSaleLines.findMany({})
    expect(lines).toHaveLength(1)
    expect(lines[0].variantId).toBe(variantId)
    const allocs = await db.query.shopSaleLineAllocations.findMany({
      where: eq(shopSaleLineAllocations.shopSaleLineId, lines[0].id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].quantity).toBe(3)
    expect(allocs[0].costPerUnitUgx).toBe('60.00')
  })

  it('throws with a clear message when total on-hand < requested', async () => {
    const itemId = await seedItem({
      articleNumber: 'S-4',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: lineId,
      quantity: 2,
      costPerUnitUgx: '60.00',
    })

    await expect(
      callServerFn(() =>
        recordSale({
          data: {
            shopId,
            paymentMethod: 'cash',
            items: [{ itemId, quantity: 5, unitPriceUgx: '150.00' }],
          },
        }),
      ),
    ).rejects.toThrow(/insufficient/i)
  })
})
