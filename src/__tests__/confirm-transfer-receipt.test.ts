/**
 * Plan 2a Task 8 — `confirmTransferReceipt` upserts one shop_stock row
 * per allocation, keyed on (shop, item, variant, supply_route_line), so
 * the cost provenance carried in `store_transfer_allocations` survives
 * the receive flow.
 *
 * Two scenarios:
 *   1. Full receipt (7 of 7) — one shop_stock row per allocation, with
 *      per-lot costs preserved (100 vs 120).
 *   2. Partial receipt (5 of 7) — receive split proportionally across
 *      allocations (last bucket absorbs rounding remainder) and a
 *      distribution_loss journal entry recorded at unitPriceUgx × loss.
 *
 * Pattern follows create-transfer-item-level.test.ts: mock auth/rbac,
 * wrap calls in `runWithStartContext`, read the DB to verify side
 * effects. The ledger lives in `transactions` joined to
 * `transaction_categories` — there is no `ledger_entries` table.
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
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '#/db'
import {
  shopStock,
  storeTransfers,
  storeTransferLines,
  transactionCategories,
  transactions,
  auditLogs,
  user,
} from '#/db/schema'
import {
  resetTestDb,
  seedItem,
  seedStore,
  seedShop,
  seedSupplyRouteLine,
  seedStoreStockLot,
} from './test-helpers'

const TEST_USER_ID = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, '0')}`
const session = {
  user: { id: TEST_USER_ID, role: 'admin' as 'admin' | 'supervisor' },
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

// Import after vi.mock so the mocks bind to the handler under test.
const { createTransfer, confirmTransferReceipt } =
  await import('#/server/functions/store/transfers')

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

// Categories the transfer + receive flow references.
const REQUIRED_CATEGORIES = [
  { name: 'Inventory - Store', type: 'asset' as const },
  { name: 'Inventory - Shop', type: 'asset' as const },
  { name: 'Store Transfer Revenue', type: 'revenue' as const },
  { name: 'Store Transfer Loss', type: 'expense' as const },
  { name: 'Inventory Loss', type: 'expense' as const },
  { name: 'Due from Shop', type: 'asset' as const },
  { name: 'Due to Store', type: 'liability' as const },
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
      name: 'Test Admin',
      email: `test-tx8-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: 'admin',
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await resetTestDb()
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

beforeEach(async () => {
  await resetTestDb()
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: 'Test Admin',
      email: `test-tx8-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: 'admin',
    })
    .onConflictDoNothing()
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
})

describe('confirmTransferReceipt — variant-flexibility', () => {
  it('creates one shop_stock row per allocation, keyed on (shop, item, variant=NULL, supply line)', async () => {
    const itemId = await seedItem({
      articleNumber: 'RX-1',
      name: 'Polo',
      minimumSellPriceUgx: '200.00',
    })
    const storeId = await seedStore()
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
      createdAt: '2026-02-01',
    })
    await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: olderLine,
      quantity: 4,
      costPerUnitUgx: '100.00',
    })
    await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: newerLine,
      quantity: 6,
      costPerUnitUgx: '120.00',
    })

    await callServerFn(() =>
      createTransfer({
        data: { shopId, items: [{ itemId, quantityDispatched: 7 }] },
      }),
    )

    const transfer = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.shopId, shopId),
    })
    if (!transfer) throw new Error('Transfer not persisted')
    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    expect(lines).toHaveLength(1)

    await callServerFn(() =>
      confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: [{ transferItemId: lines[0].id, quantityReceived: 7 }],
        },
      }),
    )

    const rows = await db.query.shopStock.findMany({
      where: and(
        eq(shopStock.shopId, shopId),
        eq(shopStock.itemId, itemId),
        isNull(shopStock.variantId),
      ),
    })
    // One row per supply line, costs preserved
    expect(rows).toHaveLength(2)
    const byLine = Object.fromEntries(rows.map((r) => [r.supplyRouteLineId, r]))
    expect(byLine[olderLine].quantityOnHand).toBe(4)
    expect(byLine[olderLine].costPerUnitUgx).toBe('100.00')
    expect(byLine[newerLine].quantityOnHand).toBe(3)
    expect(byLine[newerLine].costPerUnitUgx).toBe('120.00')
  })

  it('partial receipt records distribution loss based on the dispatched mix', async () => {
    const itemId = await seedItem({
      articleNumber: 'RX-2',
      name: 'Polo',
      minimumSellPriceUgx: '200.00',
    })
    const storeId = await seedStore()
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
      createdAt: '2026-02-01',
    })
    await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: olderLine,
      quantity: 4,
      costPerUnitUgx: '100.00',
    })
    await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: newerLine,
      quantity: 6,
      costPerUnitUgx: '120.00',
    })

    await callServerFn(() =>
      createTransfer({
        data: { shopId, items: [{ itemId, quantityDispatched: 7 }] },
      }),
    )
    const transfer = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.shopId, shopId),
    })
    if (!transfer) throw new Error('Transfer not persisted')
    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })

    await callServerFn(() =>
      confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: [
            {
              transferItemId: lines[0].id,
              quantityReceived: 5,
              discrepancyNotes: '2 units missing in transit',
            },
          ],
        },
      }),
    )

    // Shop stock totals 5 (down from dispatched 7)
    const shopRows = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(shopRows.reduce((s, r) => s + r.quantityOnHand, 0)).toBe(5)

    // A distribution_loss journal entry exists with Inventory Loss debit
    // of 2 × 200 = 400.00 UGX. Ledger lives in `transactions` joined to
    // `transaction_categories` — no `ledger_entries` table here.
    const lossCat = await db.query.transactionCategories.findFirst({
      where: eq(transactionCategories.name, 'Inventory Loss'),
    })
    if (!lossCat) throw new Error('Inventory Loss category not seeded')

    const lossRows = await db.query.transactions.findMany({
      where: and(
        eq(transactions.referenceType, 'distribution_loss'),
        eq(transactions.referenceId, lines[0].id),
        eq(transactions.categoryId, lossCat.id),
        eq(transactions.type, 'debit'),
      ),
    })
    expect(lossRows).toHaveLength(1)
    expect(lossRows[0].amount).toBe('400.00')
  })
})
