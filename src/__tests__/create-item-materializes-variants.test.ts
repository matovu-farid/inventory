/**
 * Issue #7 — create-item flow materializes variants.
 *
 * The createItem server fn used to write `items.sizes`. After #7 it
 * MUST instead materialize the (colors × sizes) cross product into the
 * variants table whenever the caller supplies colors + sizes — sizes
 * are no longer a direct item field; they live on variants.
 *
 * Pattern follows delete-variant.test.ts (mocked auth/rbac, runs the
 * server-fn machinery under runWithStartContext, then reads the DB to
 * verify the side effects).
 */
import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { runWithStartContext } from '@tanstack/start-storage-context'

import { db } from '#/db'
import { items, itemColors, variants, suppliers } from '#/db/schema'
import { createItem } from '#/server/functions/items/items'
import { addItemColor } from '#/server/functions/items/colors'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000c7'
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
    .values({ name: `Create item supplier ${SUFFIX}`, type: 'international' })
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

describe('createItem — materializes variants when colors + sizes given', () => {
  it('createItem materializes variants when colors + sizes both arrive together', async () => {
    const articleNumber = `cm-${SUFFIX}-a`

    // The form collects colors + sizes in one shot before submit and
    // passes them together; the server fn writes the cross-product.
    await callServerFn(() =>
      createItem({
        data: {
          articleNumber,
          name: 'Materialize tester',
          category: 'Test',
          supplierId,
          costPrice: '10.00',
          costCurrency: 'RMB',
          minimumSellPriceUgx: '50000',
          sizes: ['S', 'M', 'L'],
          colors: [
            { colorName: 'Indigo', colorHex: '#2a3a8b' },
            { colorName: 'Crimson', colorHex: '#a01b1b' },
          ],
        },
      }),
    )

    const created = await db.query.items.findFirst({
      where: eq(items.articleNumber, articleNumber),
    })
    expect(created).toBeDefined()
    if (!created) return
    createdItemIds.push(created.id)

    const colors = await db
      .select()
      .from(itemColors)
      .where(eq(itemColors.itemId, created.id))
    expect(colors).toHaveLength(2)

    const variantRows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, created.id))
    // 2 colors × 3 sizes = 6 variant rows.
    expect(variantRows).toHaveLength(6)
  })

  it('addItemColor with explicit sizes materializes variants for the new color', async () => {
    const articleNumber = `cm-${SUFFIX}-b`

    await callServerFn(() =>
      createItem({
        data: {
          articleNumber,
          name: 'Materialize tester B',
          category: 'Test',
          supplierId,
          costPrice: '10.00',
          costCurrency: 'RMB',
          minimumSellPriceUgx: '50000',
          sizes: [],
          colors: [],
        },
      }),
    )

    const created = await db.query.items.findFirst({
      where: eq(items.articleNumber, articleNumber),
    })
    expect(created).toBeDefined()
    if (!created) return
    createdItemIds.push(created.id)

    await callServerFn(() =>
      addItemColor({
        data: {
          itemId: created.id,
          colorName: 'Olive',
          colorHex: '#556b2f',
          sizes: ['M', 'L'],
        },
      }),
    )

    const variantRows = await db
      .select()
      .from(variants)
      .where(eq(variants.itemId, created.id))
    expect(variantRows).toHaveLength(2)
    const sizes = variantRows.map((v) => v.size).sort()
    expect(sizes).toEqual(['L', 'M'])
  })
})
