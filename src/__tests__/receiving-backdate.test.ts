import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { eq } from 'drizzle-orm'

import { db } from '#/db'
import {
  items,
  itemArticleNumbers,
  itemColors,
  stores,
  storeReceivings,
  storeStock,
  suppliers,
  supplyRoutes,
  supplyRouteLines,
  transactions,
  transactionCategories,
  auditLogs,
  user,
  variants,
} from '#/db/schema'
import { receiveGoods } from '#/server/functions/store/receiving'

// Mutable session container so individual tests can flip the role between
// "admin" and a non-admin role.
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

function assertDefined<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value == null) {
    throw new Error(message)
  }
}

const REQUIRED_CATEGORIES = [
  { name: 'Inventory - Store', type: 'asset' as const },
  { name: 'Cash', type: 'asset' as const },
  { name: 'Inventory Loss', type: 'expense' as const },
]

// Seed identifiers — generated once so we can clean up in afterAll.
const SUFFIX = `bd-${Date.now()}`
let supplierId: string
let routeId: string
let itemId: string
let lineId: string
let colorId: string

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
      email: `test-bd-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: 'admin',
    })
    .onConflictDoNothing()

  // Ensure store exists. The receive handler picks the first store; we don't
  // particularly care which row it lands on but we need at least one.
  const existingStore = await db.query.stores.findFirst()
  if (!existingStore) {
    await db.insert(stores).values({ name: `Test Store ${SUFFIX}` })
  }

  const [sup] = await db
    .insert(suppliers)
    .values({
      name: `Supplier ${SUFFIX}`,
      type: 'international',
    })
    .returning()
  supplierId = sup.id

  const [p] = await db
    .insert(items)
    .values({
      name: 'Backdate Test Article',
      design: 'Test',
    })
    .returning()
  await db
    .insert(itemArticleNumbers)
    .values({ itemId: p.id, articleNumber: `BACKDATE-A-${SUFFIX}` })
  itemId = p.id

  const [c] = await db
    .insert(itemColors)
    .values({ itemId: itemId, colorName: 'Blue', colorHex: '#1a3fcf' })
    .returning()
  colorId = c.id

  // Receiving now writes store_stock keyed on variant_id (issue #4).
  // Seed the matching variant row for (color, size).
  await db
    .insert(variants)
    .values({ itemId: itemId, colorId: colorId, size: 'M' })
    .onConflictDoNothing()

  const [route] = await db
    .insert(supplyRoutes)
    .values({
      name: `Route ${SUFFIX}`,
      status: 'open',
      departureDate: '2026-04-01',
    })
    .returning()
  routeId = route.id

  const [sri] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId: routeId,
      supplierId,
      itemId: itemId,
      colorId,
      size: 'M',
      quantity: 10,
      unitPriceForeign: '100.00',
      foreignCurrency: 'RMB',
      totalAmountForeign: '1000.00',
      totalCostUgx: '100000.00',
    })
    .returning()
  lineId = sri.id
})

afterAll(async () => {
  // Tear down anything we might have created. Order matters for FKs.
  await db
    .delete(storeReceivings)
    .where(eq(storeReceivings.supplyRouteLineId, lineId))
  // Stock now references variant_id; we delete by the variant we seeded
  // (one variant per (color, size)).
  const seededVariants = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(variants.colorId, colorId))
  for (const v of seededVariants) {
    await db.delete(storeStock).where(eq(storeStock.variantId, v.id))
  }
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(supplyRouteLines).where(eq(supplyRouteLines.id, lineId))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.id, routeId))
  await db.delete(variants).where(eq(variants.colorId, colorId))
  await db.delete(itemColors).where(eq(itemColors.id, colorId))
  await db.delete(items).where(eq(items.id, itemId))
  await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe('receiveGoods — backdating', () => {
  it('rejects backdate from non-admin and writes no rows', async () => {
    session.user.role = 'supervisor'
    try {
      await expect(
        callServerFn(() =>
          receiveGoods({
            data: {
              supplyRouteId: routeId,
              items: [
                {
                  supplyRouteLineId: lineId,
                  quantityReceived: 10,
                },
              ],
              receivedDate: new Date('2026-04-10T00:00:00Z'),
            },
          }),
        ),
      ).rejects.toThrow(/admin/i)

      const receivings = await db.query.storeReceivings.findMany({
        where: eq(storeReceivings.supplyRouteLineId, lineId),
      })
      expect(receivings).toHaveLength(0)

      const audits = await db.query.auditLogs.findMany({
        where: eq(auditLogs.actorUserId, TEST_USER_ID),
      })
      expect(audits).toHaveLength(0)
    } finally {
      session.user.role = 'admin'
    }
  })

  it('rejects date before route departureDate and writes no rows', async () => {
    await expect(
      callServerFn(() =>
        receiveGoods({
          data: {
            supplyRouteId: routeId,
            items: [
              {
                supplyRouteLineId: lineId,
                quantityReceived: 10,
              },
            ],
            receivedDate: new Date('2026-03-15T00:00:00Z'),
          },
        }),
      ),
    ).rejects.toThrow(/before goods left/i)

    const receivings = await db.query.storeReceivings.findMany({
      where: eq(storeReceivings.supplyRouteLineId, lineId),
    })
    expect(receivings).toHaveLength(0)

    const audits = await db.query.auditLogs.findMany({
      where: eq(auditLogs.actorUserId, TEST_USER_ID),
    })
    expect(audits).toHaveLength(0)
  })

  it('admin backdate within bounds threads receivedDate to all three sinks', async () => {
    const businessDate = new Date('2026-04-10T00:00:00Z')
    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId: routeId,
          items: [
            {
              supplyRouteLineId: lineId,
              quantityReceived: 10,
            },
          ],
          receivedDate: businessDate,
        },
      }),
    )

    const receiving = await db.query.storeReceivings.findFirst({
      where: eq(storeReceivings.supplyRouteLineId, lineId),
    })
    expect(receiving).toBeDefined()
    assertDefined(receiving, 'expected storeReceivings row')
    expect(receiving.receivedDate.toISOString().slice(0, 10)).toBe('2026-04-10')

    const txns = await db.query.transactions.findMany({
      where: eq(transactions.recordedBy, TEST_USER_ID),
    })
    expect(txns.length).toBeGreaterThan(0)
    for (const t of txns) {
      expect(t.transactionDate.toISOString().slice(0, 10)).toBe('2026-04-10')
    }

    const audit = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.actorUserId, TEST_USER_ID),
    })
    expect(audit).toBeDefined()
    assertDefined(audit, 'expected auditLogs row')
    const auditBusinessDate = audit.businessDate
    expect(auditBusinessDate).not.toBeNull()
    assertDefined(auditBusinessDate, 'expected auditLogs.businessDate')
    expect(auditBusinessDate.toISOString().slice(0, 10)).toBe('2026-04-10')
    expect(audit.description).toContain('2026-04-10')
    // recordedAt is "today" in the test run; we cannot pin it, but the
    // description should mention both dates side-by-side.
    const recordedDay = audit.createdAt.toISOString().slice(0, 10)
    expect(audit.description).toContain(recordedDay)
  })
})
