/**
 * Task 11 (variant-flexibility Plan 1):
 * `specifyStock` splits an unresolved store_stock row (variant_id NULL)
 * into N variant-keyed rows + optional leftover. Cost and supply-line
 * are inherited. New variants are auto-materialised.
 *
 * Pattern follows receive-unresolved.test.ts: mock auth/rbac, wrap calls
 * in runWithStartContext, read the DB to verify side effects.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { and, eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import {
  items,
  itemArticleNumbers,
  itemColors,
  stores,
  storeStock,
  suppliers,
  supplyRoutes,
  supplyRouteLines,
  auditLogs,
  user,
  variants,
} from '#/db/schema'
import { specifyStock } from '#/server/functions/store/specify'

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

const SUFFIX = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// IDs we create at the suite level and need to tear down.
let storeId: string
let supplierId: string
let supplyRouteId: string
const createdItemIds: string[] = []
const createdSupplyRouteLineIds: string[] = []

async function seedItem(opts: {
  articleSuffix: string
  name: string
}): Promise<string> {
  const [row] = await db
    .insert(items)
    .values({
      name: opts.name,
      design: 'Test',
    })
    .returning()
  await db.insert(itemArticleNumbers).values({
    itemId: row.id,
    articleNumber: `${opts.articleSuffix}-${SUFFIX}`,
  })
  createdItemIds.push(row.id)
  return row.id
}

async function seedColor(opts: {
  itemId: string
  colorName: string
  colorHex: string
}): Promise<string> {
  const [row] = await db
    .insert(itemColors)
    .values({
      itemId: opts.itemId,
      colorName: opts.colorName,
      colorHex: opts.colorHex,
    })
    .returning()
  return row.id
}

async function seedUnresolvedStock(opts: {
  storeId: string
  itemId: string
  quantity: number
  costPerUnitUgx: string
}): Promise<{ stockId: string; supplyRouteLineId: string }> {
  // Need a supply-line to inherit from.
  const [line] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId,
      supplierId,
      itemId: opts.itemId,
      quantity: opts.quantity,
      unitPriceForeign: '10.00',
      foreignCurrency: 'RMB',
      totalAmountForeign: `${opts.quantity * 10}.00`,
      totalCostUgx: `${opts.quantity * Number(opts.costPerUnitUgx)}.00`,
    })
    .returning()
  createdSupplyRouteLineIds.push(line.id)

  const [stockRow] = await db
    .insert(storeStock)
    .values({
      storeId: opts.storeId,
      itemId: opts.itemId,
      variantId: null,
      supplyRouteLineId: line.id,
      quantityOnHand: opts.quantity,
      costPerUnitUgx: opts.costPerUnitUgx,
    })
    .returning()

  return { stockId: stockRow.id, supplyRouteLineId: line.id }
}

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: 'Specify Test Admin',
      email: `specify-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: 'admin',
    })
    .onConflictDoNothing()

  const existingStore = await db.query.stores.findFirst()
  if (existingStore) {
    storeId = existingStore.id
  } else {
    const [s] = await db
      .insert(stores)
      .values({ name: `Test Store ${SUFFIX}` })
      .returning()
    storeId = s.id
  }

  const [sup] = await db
    .insert(suppliers)
    .values({ name: `Supplier ${SUFFIX}`, type: 'international' })
    .returning()
  supplierId = sup.id

  const [route] = await db
    .insert(supplyRoutes)
    .values({
      name: `Route ${SUFFIX}`,
      status: 'open',
      departureDate: '2026-04-01',
    })
    .returning()
  supplyRouteId = route.id
})

afterAll(async () => {
  if (createdItemIds.length > 0) {
    await db
      .delete(storeStock)
      .where(inArray(storeStock.itemId, createdItemIds))
    await db.delete(variants).where(inArray(variants.itemId, createdItemIds))
  }
  if (createdSupplyRouteLineIds.length > 0) {
    await db
      .delete(supplyRouteLines)
      .where(inArray(supplyRouteLines.id, createdSupplyRouteLineIds))
  }
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  if (supplyRouteId) {
    await db.delete(supplyRoutes).where(eq(supplyRoutes.id, supplyRouteId))
  }
  if (createdItemIds.length > 0) {
    await db
      .delete(itemColors)
      .where(inArray(itemColors.itemId, createdItemIds))
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
  if (supplierId) {
    await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  }
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe('specifyStock', () => {
  it('splits an unresolved row into N variant-keyed rows when fully specified', async () => {
    const itemId = await seedItem({ articleSuffix: 'TR-01', name: 'Tee 01' })
    const burgundyId = await seedColor({
      itemId,
      colorName: 'Burgundy',
      colorHex: '#722F37',
    })
    const forestId = await seedColor({
      itemId,
      colorName: 'Forest',
      colorHex: '#1F3D26',
    })
    const { stockId, supplyRouteLineId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 9,
      costPerUnitUgx: '100.00',
    })

    await callServerFn(() =>
      specifyStock({
        data: {
          storeStockId: stockId,
          lines: [
            { colorId: burgundyId, size: 'M', quantity: 5 },
            { colorId: forestId, size: 'L', quantity: 4 },
          ],
        },
      }),
    )

    // Original row gone
    const orig = await db.query.storeStock.findFirst({
      where: eq(storeStock.id, stockId),
    })
    expect(orig).toBeUndefined()

    // Two new variant-keyed rows, qty 5 + 4, inheriting cost
    const newRows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.storeId, storeId),
        eq(storeStock.itemId, itemId),
        eq(storeStock.supplyRouteLineId, supplyRouteLineId),
      ),
    })
    expect(newRows).toHaveLength(2)
    expect(newRows.map((r) => r.quantityOnHand).sort()).toEqual([4, 5])
    for (const r of newRows) {
      expect(r.costPerUnitUgx).toBe('100.00')
      expect(r.variantId).not.toBeNull()
    }
  })

  it('leaves a leftover unresolved row when specified < total', async () => {
    const itemId = await seedItem({ articleSuffix: 'TR-02', name: 'Tee 02' })
    const burgundyId = await seedColor({
      itemId,
      colorName: 'Burgundy',
      colorHex: '#722F37',
    })
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 9,
      costPerUnitUgx: '100.00',
    })

    await callServerFn(() =>
      specifyStock({
        data: {
          storeStockId: stockId,
          lines: [{ colorId: burgundyId, size: 'M', quantity: 5 }],
        },
      }),
    )

    const orig = await db.query.storeStock.findFirst({
      where: eq(storeStock.id, stockId),
    })
    expect(orig?.quantityOnHand).toBe(4)
    expect(orig?.variantId).toBeNull()
  })

  it("creates the variant row if it doesn't exist yet", async () => {
    const itemId = await seedItem({ articleSuffix: 'TR-03', name: 'Tee 03' })
    const colorId = await seedColor({
      itemId,
      colorName: 'Burgundy',
      colorHex: '#722F37',
    })
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 5,
      costPerUnitUgx: '100.00',
    })

    await callServerFn(() =>
      specifyStock({
        data: {
          storeStockId: stockId,
          lines: [{ colorId, size: 'XS', quantity: 5 }],
        },
      }),
    )

    const v = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, colorId), eq(variants.size, 'XS')),
    })
    expect(v).toBeDefined()
  })

  it('rejects when sum(lines) > available qty', async () => {
    const itemId = await seedItem({ articleSuffix: 'TR-04', name: 'Tee 04' })
    const colorId = await seedColor({
      itemId,
      colorName: 'Burgundy',
      colorHex: '#722F37',
    })
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId,
      quantity: 5,
      costPerUnitUgx: '100.00',
    })

    await expect(
      callServerFn(() =>
        specifyStock({
          data: {
            storeStockId: stockId,
            lines: [{ colorId, size: 'M', quantity: 6 }],
          },
        }),
      ),
    ).rejects.toThrow(/exceeds available/i)
  })

  it('rejects when source row is variant-keyed (not unresolved)', async () => {
    const itemId = await seedItem({ articleSuffix: 'TR-05', name: 'Tee 05' })
    const colorId = await seedColor({
      itemId,
      colorName: 'Burgundy',
      colorHex: '#722F37',
    })
    // Manually create a variant + variant-keyed stock row (not unresolved).
    const [variantRow] = await db
      .insert(variants)
      .values({ itemId, colorId, size: 'M' })
      .returning()

    const [line] = await db
      .insert(supplyRouteLines)
      .values({
        supplyRouteId,
        supplierId,
        itemId,
        colorId,
        size: 'M',
        quantity: 5,
        unitPriceForeign: '10.00',
        foreignCurrency: 'RMB',
        totalAmountForeign: '50.00',
        totalCostUgx: '500.00',
      })
      .returning()
    createdSupplyRouteLineIds.push(line.id)

    const [stockRow] = await db
      .insert(storeStock)
      .values({
        storeId,
        itemId,
        variantId: variantRow.id,
        supplyRouteLineId: line.id,
        quantityOnHand: 5,
        costPerUnitUgx: '100.00',
      })
      .returning()

    await expect(
      callServerFn(() =>
        specifyStock({
          data: {
            storeStockId: stockRow.id,
            lines: [{ colorId, size: 'L', quantity: 1 }],
          },
        }),
      ),
    ).rejects.toThrow(/already specified|already/i)
  })

  it('rejects when colorId does not belong to the item', async () => {
    const itemA = await seedItem({ articleSuffix: 'TR-06A', name: 'Tee 06A' })
    const itemB = await seedItem({ articleSuffix: 'TR-06B', name: 'Tee 06B' })
    // Color belongs to itemB.
    const wrongColorId = await seedColor({
      itemId: itemB,
      colorName: 'Burgundy',
      colorHex: '#722F37',
    })
    const { stockId } = await seedUnresolvedStock({
      storeId,
      itemId: itemA,
      quantity: 5,
      costPerUnitUgx: '100.00',
    })

    await expect(
      callServerFn(() =>
        specifyStock({
          data: {
            storeStockId: stockId,
            // Color belongs to itemB but the stock row is itemA.
            lines: [{ colorId: wrongColorId, size: 'M', quantity: 1 }],
          },
        }),
      ),
    ).rejects.toThrow(/does not belong/i)
  })
})
