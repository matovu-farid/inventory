/**
 * Plan 2b Tasks 14 + 15 — item-level dispatchStoreReturn +
 * receiveStoreReturn. Mirror of the transfer flow, in reverse:
 *   - Dispatch: shop → store. Picks shop_stock FIFO (unresolved-first).
 *   - Receive: rebuilds store_stock per allocation, preserving the
 *     supply_route_line_id from the original lot.
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
  storeReturns,
  storeReturnLines,
  storeReturnLineAllocations,
  storeStock,
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
  { name: 'Inventory - Store', type: 'asset' as const },
  { name: 'Inventory - Shop', type: 'asset' as const },
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
      email: `test-stret-${TEST_USER_ID}@example.com`,
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

describe('dispatchStoreReturn + receiveStoreReturn — item-level', () => {
  it('dispatches an unresolved item with FIFO allocations + receive rebuilds store_stock', async () => {
    const itemId = await seedItem({
      articleNumber: 'STR-1',
      name: 'Polo',
      minimumSellPriceUgx: '200.00',
    })
    const shopId = await seedShop()
    const storeId = await seedStore()
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
      createdAt: '2026-02-01',
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: olderLine,
      quantity: 4,
      costPerUnitUgx: '60.00',
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: newerLine,
      quantity: 6,
      costPerUnitUgx: '80.00',
    })

    // Dispatch 7 unresolved units back to the store
    await callServerFn(() =>
      dispatchStoreReturn({
        data: {
          shopId,
          storeId,
          reason: 'wrong item shipped',
          items: [
            { itemId, quantityDispatched: 7, unitTransferPriceUgx: '150.00' },
          ],
        },
      }),
    )

    const ret = await db.query.storeReturns.findFirst({
      where: eq(storeReturns.shopId, shopId),
    })
    if (!ret) throw new Error('Return missing')
    const lines = await db.query.storeReturnLines.findMany({
      where: eq(storeReturnLines.storeReturnId, ret.id),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].itemId).toBe(itemId)
    expect(lines[0].variantId).toBeNull()
    expect(lines[0].shopStockId).toBeNull()

    const allocs = await db.query.storeReturnLineAllocations.findMany({
      where: eq(storeReturnLineAllocations.storeReturnLineId, lines[0].id),
    })
    expect(allocs).toHaveLength(2)
    const qs = allocs.map((a) => a.quantity).sort((x, y) => x - y)
    expect(qs).toEqual([3, 4])

    // Shop stock decremented from 10 → 3
    const remainingShop = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(remainingShop.reduce((s, r) => s + r.quantityOnHand, 0)).toBe(3)

    // Confirm receipt (full)
    await callServerFn(() =>
      receiveStoreReturn({
        data: {
          storeReturnId: ret.id,
          itemReceipts: [
            { storeReturnItemId: lines[0].id, quantityReceived: 7 },
          ],
        },
      }),
    )

    // Store stock rebuilt — two rows (one per source lot), each carrying
    // its original supply_route_line_id and lot cost.
    const storeRows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.storeId, storeId),
        eq(storeStock.itemId, itemId),
      ),
    })
    expect(storeRows.reduce((s, r) => s + r.quantityOnHand, 0)).toBe(7)
    const supplyLines = storeRows.map((r) => r.supplyRouteLineId).sort()
    expect(supplyLines).toEqual([olderLine, newerLine].sort())
    for (const r of storeRows) {
      expect(r.variantId).toBeNull()
    }
  })

  it('throws shortfall when shop stock < requested', async () => {
    const itemId = await seedItem({
      articleNumber: 'STR-2',
      name: 'Polo',
      minimumSellPriceUgx: '200.00',
    })
    const shopId = await seedShop()
    const storeId = await seedStore()
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
        dispatchStoreReturn({
          data: {
            shopId,
            storeId,
            reason: 'too few',
            items: [
              { itemId, quantityDispatched: 5, unitTransferPriceUgx: '150.00' },
            ],
          },
        }),
      ),
    ).rejects.toThrow(/insufficient/i)
  })
})
