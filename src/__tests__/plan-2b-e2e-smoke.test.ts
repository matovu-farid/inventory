/**
 * Plan 2b Task 19 — End-to-end smoke covering the item-level sales,
 * customer returns, and store returns introduced by Tasks 1-17.
 *
 * Two scenarios:
 *   A. Unresolved chain: sell from unresolved shop_stock → customer
 *      return puts goods back to the same lot → dispatch the rest to
 *      the store → store confirms receipt and rebuilds store_stock
 *      with supply_route_line_id preserved.
 *   B. Variant chain: same shape but with fully-resolved variants.
 *      Confirms the variant-keyed path doesn't regress.
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
  shopStock,
  storeStock,
  shopSales,
  shopSaleLines,
  shopSaleLineAllocations,
  shopReturns,
  shopReturnLines,
  storeReturns,
  storeReturnLines,
  storeReturnLineAllocations,
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
  seedStore,
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
const { dispatchStoreReturn, receiveStoreReturn } =
  await import('#/server/functions/store/returns')

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
  { name: 'Inventory - Store', type: 'asset' as const },
  { name: 'Store Transfer Revenue', type: 'revenue' as const },
  { name: 'Store Transfer Loss', type: 'expense' as const },
  { name: 'Due from Shop', type: 'asset' as const },
  { name: 'Due to Store', type: 'liability' as const },
]

async function reseedUser() {
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: 'Test Admin',
      email: `test-e2e2b-${TEST_USER_ID}@example.com`,
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

describe('Plan 2b — end-to-end smoke', () => {
  it('unresolved chain: sell → customer return → dispatch → store receipt', async () => {
    const itemId = await seedItem({
      articleNumber: 'E2E-1',
      name: 'Polo',
      minimumSellPriceUgx: '100.00',
    })
    const shopId = await seedShop()
    const storeId = await seedStore()
    const supplyLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    const { stockId } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: supplyLine,
      quantity: 10,
      costPerUnitUgx: '60.00',
    })

    // 1) Sell 4 from the unresolved lot
    await callServerFn(() =>
      recordSale({
        data: {
          shopId,
          paymentMethod: 'cash',
          items: [{ itemId, quantity: 4, unitPriceUgx: '150.00' }],
        },
      }),
    )
    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error('sale missing')
    const saleLine = (
      await db.query.shopSaleLines.findMany({
        where: eq(shopSaleLines.shopSaleId, sale.id),
      })
    )[0]
    expect(saleLine.itemId).toBe(itemId)
    expect(saleLine.variantId).toBeNull()
    expect(saleLine.shopStockId).toBeNull()
    const saleAllocs = await db.query.shopSaleLineAllocations.findMany({
      where: eq(shopSaleLineAllocations.shopSaleLineId, saleLine.id),
    })
    expect(saleAllocs).toHaveLength(1)
    expect(saleAllocs[0].shopStockId).toBe(stockId)
    expect(saleAllocs[0].quantity).toBe(4)
    expect(
      (
        await db.query.shopStock.findFirst({
          where: eq(shopStock.id, stockId),
        })
      )?.quantityOnHand,
    ).toBe(6)

    // 2) Customer returns 2 against the sale
    await callServerFn(() =>
      recordCustomerReturn({
        data: {
          shopId,
          originalSaleId: sale.id,
          reason: 'wrong size',
          refundMethod: 'cash',
          items: [{ itemId, quantity: 2, unitRefundPriceUgx: '150.00' }],
        },
      }),
    )
    expect(
      (
        await db.query.shopStock.findFirst({
          where: eq(shopStock.id, stockId),
        })
      )?.quantityOnHand,
    ).toBe(8)
    const ret = await db.query.shopReturns.findFirst({
      where: eq(shopReturns.shopId, shopId),
    })
    if (!ret) throw new Error('customer return missing')
    const retLine = (
      await db.query.shopReturnLines.findMany({
        where: eq(shopReturnLines.shopReturnId, ret.id),
      })
    )[0]
    expect(retLine.itemId).toBe(itemId)
    expect(retLine.variantId).toBeNull()

    // 3) Dispatch 5 back to the store
    await callServerFn(() =>
      dispatchStoreReturn({
        data: {
          shopId,
          storeId,
          reason: 'store reclaim',
          items: [
            { itemId, quantityDispatched: 5, unitTransferPriceUgx: '150.00' },
          ],
        },
      }),
    )
    expect(
      (
        await db.query.shopStock.findFirst({
          where: eq(shopStock.id, stockId),
        })
      )?.quantityOnHand,
    ).toBe(3)
    const storeRet = await db.query.storeReturns.findFirst({
      where: eq(storeReturns.shopId, shopId),
    })
    if (!storeRet) throw new Error('store return missing')
    const storeRetLine = (
      await db.query.storeReturnLines.findMany({
        where: eq(storeReturnLines.storeReturnId, storeRet.id),
      })
    )[0]
    const storeRetAllocs = await db.query.storeReturnLineAllocations.findMany({
      where: eq(storeReturnLineAllocations.storeReturnLineId, storeRetLine.id),
    })
    expect(storeRetAllocs).toHaveLength(1)
    expect(storeRetAllocs[0].supplyRouteLineId).toBe(supplyLine)

    // 4) Store receives — rebuild store_stock with supply line provenance
    await callServerFn(() =>
      receiveStoreReturn({
        data: {
          storeReturnId: storeRet.id,
          itemReceipts: [
            { storeReturnItemId: storeRetLine.id, quantityReceived: 5 },
          ],
        },
      }),
    )
    const storeRows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.storeId, storeId),
        eq(storeStock.itemId, itemId),
      ),
    })
    expect(storeRows).toHaveLength(1)
    expect(storeRows[0].variantId).toBeNull()
    expect(storeRows[0].supplyRouteLineId).toBe(supplyLine)
    expect(storeRows[0].quantityOnHand).toBe(5)
    expect(storeRows[0].costPerUnitUgx).toBe('60.00')
  })

  it('variant chain: same flow with fully-resolved variants survives the round trip', async () => {
    const itemId = await seedItem({
      articleNumber: 'E2E-2',
      name: 'Tee',
      minimumSellPriceUgx: '100.00',
    })
    const colorId = await seedColor({
      itemId,
      colorName: 'Burgundy',
      colorHex: '#a00',
    })
    const shopId = await seedShop()
    const storeId = await seedStore()
    const supplyLine = await seedSupplyRouteLine({ itemId, colorId, size: 'M' })
    const { stockId, variantId } = await seedShopStockLot({
      shopId,
      itemId,
      colorId,
      size: 'M',
      supplyRouteLineId: supplyLine,
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
    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error('sale missing')

    await callServerFn(() =>
      recordCustomerReturn({
        data: {
          shopId,
          originalSaleId: sale.id,
          reason: "doesn't fit",
          refundMethod: 'cash',
          items: [
            { itemId, variantId, quantity: 1, unitRefundPriceUgx: '150.00' },
          ],
        },
      }),
    )
    expect(
      (
        await db.query.shopStock.findFirst({
          where: eq(shopStock.id, stockId),
        })
      )?.quantityOnHand,
    ).toBe(8)

    await callServerFn(() =>
      dispatchStoreReturn({
        data: {
          shopId,
          storeId,
          reason: 'store reclaim',
          items: [
            {
              itemId,
              variantId,
              quantityDispatched: 4,
              unitTransferPriceUgx: '150.00',
            },
          ],
        },
      }),
    )
    const storeRet = await db.query.storeReturns.findFirst({
      where: eq(storeReturns.shopId, shopId),
    })
    if (!storeRet) throw new Error('store return missing')
    const storeRetLine = (
      await db.query.storeReturnLines.findMany({
        where: eq(storeReturnLines.storeReturnId, storeRet.id),
      })
    )[0]
    expect(storeRetLine.variantId).toBe(variantId)

    await callServerFn(() =>
      receiveStoreReturn({
        data: {
          storeReturnId: storeRet.id,
          itemReceipts: [
            { storeReturnItemId: storeRetLine.id, quantityReceived: 4 },
          ],
        },
      }),
    )
    const storeRows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.storeId, storeId),
        eq(storeStock.itemId, itemId),
      ),
    })
    expect(storeRows).toHaveLength(1)
    expect(storeRows[0].variantId).toBe(variantId)
    expect(storeRows[0].supplyRouteLineId).toBe(supplyLine)
    expect(storeRows[0].quantityOnHand).toBe(4)
    expect(storeRows[0].costPerUnitUgx).toBe('70.00')
  })
})
