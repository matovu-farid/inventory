/**
 * Plan 2b Task 11 — `recordCustomerReturn` accepts item-level input.
 *
 * Two flows:
 *   1. With `originalSaleId`: walks the sale's allocation breakdown
 *      and re-increments the original source shop_stock rows.
 *   2. Without: re-stocks the newest matching shop_stock lot (the lot
 *      most likely to be the one the goods came from).
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
import { eq } from 'drizzle-orm'

import { db } from '#/db'
import {
  shopSales,
  shopReturns,
  shopReturnLines,
  shopReturnLineAllocations,
  shopStock,
  transactionCategories,
  transactions,
  auditLogs,
  user,
} from '#/db/schema'
import {
  resetTestDb,
  seedItem,
  seedShop,
  seedSupplyRouteLine,
  seedShopStockLot,
} from './test-helpers'

const TEST_USER_ID = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`
const session = { user: { id: TEST_USER_ID, role: 'admin' as const } }

vi.mock('#/server/middleware/auth', () => ({
  requireSession: () => Promise.resolve(session),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => undefined,
  hasRole: () => true,
  requireSessionAndRole: () => Promise.resolve(session),
}))

const { recordSale } = await import('#/server/functions/shop/sales')
const { recordCustomerReturn } = await import('#/server/functions/shop/returns')

const stubStartContext = {
  getRouter: (() => {
    throw new Error('router not available')
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
  { name: 'Sales Revenue', type: 'revenue' as const },
  { name: 'Sales Returns', type: 'revenue' as const },
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
      email: `test-ret11-${TEST_USER_ID}@example.com`,
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

describe('recordCustomerReturn — item-level', () => {
  it('with originalSaleId: re-stocks the original allocation lots', async () => {
    const itemId = await seedItem({
      articleNumber: 'RET-1',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    const { stockId } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: lineId,
      quantity: 10,
      costPerUnitUgx: '60.00',
    })

    // Sell 4
    await callServerFn(() =>
      recordSale({
        data: {
          shopId,
          paymentMethod: 'cash',
          items: [{ itemId, quantity: 4, unitPriceUgx: '150.00' }],
        },
      }),
    )

    // Source lot now has 6 left
    const beforeReturn = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, stockId),
    })
    expect(beforeReturn?.quantityOnHand).toBe(6)

    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error('Sale missing')

    // Return 2 of the 4
    await callServerFn(() =>
      recordCustomerReturn({
        data: {
          shopId,
          originalSaleId: sale.id,
          reason: "buyer's remorse",
          refundMethod: 'cash',
          items: [{ itemId, quantity: 2, unitRefundPriceUgx: '150.00' }],
        },
      }),
    )

    // Source lot back to 8
    const afterReturn = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, stockId),
    })
    expect(afterReturn?.quantityOnHand).toBe(8)

    const ret = await db.query.shopReturns.findFirst({
      where: eq(shopReturns.shopId, shopId),
    })
    if (!ret) throw new Error('Return missing')
    const retLines = await db.query.shopReturnLines.findMany({
      where: eq(shopReturnLines.shopReturnId, ret.id),
    })
    expect(retLines).toHaveLength(1)
    expect(retLines[0].itemId).toBe(itemId)
    expect(retLines[0].variantId).toBeNull()
    expect(retLines[0].shopStockId).toBeNull()
    expect(retLines[0].quantity).toBe(2)

    const allocs = await db.query.shopReturnLineAllocations.findMany({
      where: eq(shopReturnLineAllocations.shopReturnLineId, retLines[0].id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].shopStockId).toBe(stockId)
    expect(allocs[0].quantity).toBe(2)
    expect(allocs[0].costPerUnitUgx).toBe('60.00')
  })

  it('without originalSaleId: re-stocks newest matching lot', async () => {
    const itemId = await seedItem({
      articleNumber: 'RET-2',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const shopId = await seedShop()
    const olderLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: '2026-01-01',
    })
    const newerLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: '2026-03-01',
    })
    const { stockId: olderId } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: olderLine,
      quantity: 5,
      costPerUnitUgx: '60.00',
    })
    const { stockId: newerId } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: newerLine,
      quantity: 5,
      costPerUnitUgx: '80.00',
    })

    await callServerFn(() =>
      recordCustomerReturn({
        data: {
          shopId,
          reason: 'open counter return',
          refundMethod: 'cash',
          items: [{ itemId, quantity: 2, unitRefundPriceUgx: '150.00' }],
        },
      }),
    )

    const older = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, olderId),
    })
    const newer = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, newerId),
    })
    expect(older?.quantityOnHand).toBe(5)
    expect(newer?.quantityOnHand).toBe(7) // newest lot was restocked
  })
})
