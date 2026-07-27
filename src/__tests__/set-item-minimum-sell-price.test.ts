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
import { items } from '#/db/schema'
import { setItemMinimumSellPrice } from '#/server/functions/items/prices'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000c8'
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
const createdItemIds: string[] = []

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
})

describe('setItemMinimumSellPrice', () => {
  it("updates the item's minimum_sell_price_ugx", async () => {
    const inserted = await db
      .insert(items)
      .values({
        articleNumber: `simsp-${SUFFIX}-a`,
        name: 'Min-price tester',
        category: 'Test',
      })
      .returning()
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
})
