/**
 * Task 4 (variant-flexibility Plan 1):
 * `createItem` accepts and persists `minimumSellPriceUgx` and
 * `lowStockThreshold` (the item-level columns added in Task 1).
 *
 * Pattern follows create-item-materializes-variants.test.ts:
 * mock auth/rbac, run server-fns under runWithStartContext, then read
 * the DB to verify side effects.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { runWithStartContext } from '@tanstack/start-storage-context'

import { db } from '#/db'
import { items, variants, suppliers } from '#/db/schema'
import { createItem } from '#/server/functions/items/items'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000c9'
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
let supplierId = ''

beforeAll(async () => {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name: `Min price supplier ${SUFFIX}`, type: 'international' })
    .returning()
  supplierId = supplier.id
})

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await db.delete(variants).where(inArray(variants.itemId, createdItemIds))
    await db.delete(items).where(inArray(items.id, createdItemIds))
    if (supplierId)
      await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  }
})

describe('createItem — variant-flexibility fields', () => {
  it('persists minimumSellPriceUgx and lowStockThreshold', async () => {
    const articleNumber = `tr-min-${SUFFIX}`
    await callServerFn(() =>
      createItem({
        data: {
          articleNumber,
          name: 'Min Test',
          category: 'Tops',
          supplierId,
          costPrice: '10.00',
          costCurrency: 'RMB',
          sizes: [],
          colors: [],
          minimumSellPriceUgx: '9500.00',
          lowStockThreshold: 5,
        },
      }),
    )
    const row = await db.query.items.findFirst({
      where: eq(items.articleNumber, articleNumber),
    })
    expect(row).toBeDefined()
    if (row) createdItemIds.push(row.id)
    expect(row?.minimumSellPriceUgx).toBe('9500.00')
    expect(row?.lowStockThreshold).toBe(5)
  })

  it('rejects items without a complete commercial profile', async () => {
    const articleNumber = `tr-def-${SUFFIX}`
    await expect(
      callServerFn(() =>
        createItem({
          data: {
            articleNumber,
            name: 'Default Test',
            category: 'Tops',
            sizes: [],
            colors: [],
          },
        }),
      ),
    ).rejects.toThrow('Supplier, supplier cost')
  })
})
