/**
 * Issue #6 — server functions (receiving / opening-balance) operate on
 * variant_id, and `supply_route_items` renames its catalog FK columns:
 *
 *   product_id        → item_id
 *   product_color_id  → color_id
 *
 * The TABLE name stays `supply_route_items`; the table rename to
 * `supply_route_lines` lives in Phase 2 (#8).
 *
 * This file pins down:
 *
 *   1. supply_route_items exposes `item_id` / `color_id` (and the old
 *      column names are gone from the running schema).
 *   2. addStoreOpeningBalance / addShopOpeningBalance accept a
 *      `variantId` directly — the legacy (productColorId, size) shape
 *      is removed.
 *   3. receiveGoods auto-creates a variant when the supply line resolves
 *      to a (color, size) pair that the catalog hasn't materialised yet.
 *      Aggregate / color-only lines still throw — operators must split
 *      them before receiving.
 *   4. recordAuditLog metadata for receiveGoods includes a `lines` array
 *      with the variant's (colorName, size) pair so historic audit
 *      payloads stay self-describing after the variant_id swap.
 *
 * Pattern follows `src/__tests__/notifications-variant-id.test.ts` and
 * `src/__tests__/opening-balance-variants.test.ts`.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { runWithStartContext } from '@tanstack/start-storage-context'

import { db } from '#/db'
import {
  auditLogs,
  itemCategories,
  itemColors,
  items,
  shopStock,
  shops,
  storeReceivings,
  storeStock,
  stores,
  supplyRouteItems,
  supplyRoutes,
  suppliers,
  transactionCategories,
  transactions,
  user as userTable,
  variants,
} from '#/db/schema'
import { addShopOpeningBalance, addStoreOpeningBalance } from '#/server/functions/admin/opening-balance'
import { receiveGoods } from '#/server/functions/store/receiving'
import { assertDefined } from './test-helpers'

// TanStack Start server-fn machinery needs a request context inside Vitest.
// Stub the auth/rbac middleware so the handler runs end-to-end against the
// test DB.
const TEST_USER_ID = '00000000-0000-0000-0000-0000000000c6'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: 'admin' },
    }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
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

const REQUIRED_CATEGORIES = [
  { name: 'Inventory - Store', type: 'asset' as const },
  { name: 'Inventory - Shop', type: 'asset' as const },
  { name: "Owner's Equity", type: 'equity' as const },
  { name: 'Cash', type: 'asset' as const },
  { name: 'Inventory Loss', type: 'expense' as const },
]

interface Fixture {
  itemId?: string
  colorId?: string
  variantId?: string
  storeId?: string
  shopId?: string
  supplierId?: string
}

const FIXTURE: Fixture = {}

function itemId(): string {
  assertDefined(FIXTURE.itemId, 'FIXTURE.itemId not seeded')
  return FIXTURE.itemId
}
function colorId(): string {
  assertDefined(FIXTURE.colorId, 'FIXTURE.colorId not seeded')
  return FIXTURE.colorId
}
function variantId(): string {
  assertDefined(FIXTURE.variantId, 'FIXTURE.variantId not seeded')
  return FIXTURE.variantId
}
function storeId(): string {
  assertDefined(FIXTURE.storeId, 'FIXTURE.storeId not seeded')
  return FIXTURE.storeId
}
function shopId(): string {
  assertDefined(FIXTURE.shopId, 'FIXTURE.shopId not seeded')
  return FIXTURE.shopId
}
function supplierId(): string {
  assertDefined(FIXTURE.supplierId, 'FIXTURE.supplierId not seeded')
  return FIXTURE.supplierId
}

beforeAll(async () => {
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
  await db
    .insert(userTable)
    .values({
      id: TEST_USER_ID,
      name: 'Server Variant Tester',
      email: `server-variant-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: 'admin',
    })
    .onConflictDoNothing()

  const [uncat] = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, 'Uncategorized'))

  // Unique suffix per run guards against leftover rows from a previous
  // crash and against parallel test files (vitest runs files in parallel
  // by default).
  const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const [s] = await db
    .insert(suppliers)
    .values({ name: `SV Supplier ${SUFFIX}`, type: 'international' })
    .returning()
  FIXTURE.supplierId = s.id

  const [p] = await db
    .insert(items)
    .values({
      articleNumber: `SV-${Date.now()}`,
      name: 'Server Variant Item',
      sizes: ['M', 'L'],
      itemCategoryId: uncat.id,
    })
    .returning()
  FIXTURE.itemId = p.id

  const [c] = await db
    .insert(itemColors)
    .values({ itemId: p.id, colorName: 'Slate', colorHex: '#445566' })
    .returning()
  FIXTURE.colorId = c.id

  const [v] = await db
    .insert(variants)
    .values({ itemId: p.id, colorId: c.id, size: 'M' })
    .returning()
  FIXTURE.variantId = v.id

  // `receiveGoods` resolves the store via `db.query.stores.findFirst()`,
  // so we have to land on whatever row that returns. Use the existing one
  // when present; create a fixture row only if the table is empty.
  let existingStore = await db.query.stores.findFirst()
  if (!existingStore) {
    ;[existingStore] = await db
      .insert(stores)
      .values({ name: 'SV Store' })
      .returning()
  }
  FIXTURE.storeId = existingStore.id

  const [shop] = await db
    .insert(shops)
    .values({ name: `SV Shop ${Date.now()}` })
    .returning()
  FIXTURE.shopId = shop.id
})

afterAll(async () => {
  // Order matters because of FK chains:
  //   store_stock → supply_route_items
  //   store_receivings → supply_route_items
  //   shop_stock / store_stock → variants → items
  // Drop the dependent rows before the parents.
  await db.delete(shopStock).where(eq(shopStock.shopId, shopId()))
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId()))
  await db.delete(storeReceivings).where(
    sql`${storeReceivings.supplyRouteItemId} IN (
        SELECT id FROM ${supplyRouteItems}
        WHERE ${supplyRouteItems.supplierId} = ${supplierId()}::uuid
    )`,
  )
  await db.delete(supplyRouteItems).where(eq(supplyRouteItems.supplierId, supplierId()))
  await db.delete(supplyRoutes).where(sql`${supplyRoutes.name} LIKE 'SV-Route-%'`)
  await db.delete(variants).where(eq(variants.itemId, itemId()))
  await db.delete(itemColors).where(eq(itemColors.id, colorId()))
  await db.delete(items).where(eq(items.id, itemId()))
  await db.delete(shops).where(eq(shops.id, shopId()))
  // We deliberately don't delete the store — receiveGoods locates one via
  // `findFirst()`, so other suites running in parallel rely on the row
  // we may have inherited.
  await db.delete(suppliers).where(eq(suppliers.id, supplierId()))
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(userTable).where(eq(userTable.id, TEST_USER_ID))
})

async function clearTestRows(): Promise<void> {
  // Order: storeStock first (it FK's into supply_route_items), then the
  // receivings, then the supply lines, then audit / variants.
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId()))
  await db.delete(shopStock).where(eq(shopStock.shopId, shopId()))
  // Use a subquery so we only drop the receivings WE created — other
  // suites running in parallel may share `storeId()` via findFirst().
  await db.delete(storeReceivings).where(
    sql`${storeReceivings.supplyRouteItemId} IN (
        SELECT id FROM ${supplyRouteItems}
        WHERE ${supplyRouteItems.supplierId} = ${supplierId()}::uuid
    )`,
  )
  await db.delete(supplyRouteItems).where(eq(supplyRouteItems.supplierId, supplierId()))
  await db.delete(supplyRoutes).where(sql`${supplyRoutes.name} LIKE 'SV-Route-%'`)
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  // Re-seed the canonical (Slate, M) variant for each test — earlier tests
  // exercise the "auto-create variant on receive" path that may have left
  // additional variant rows behind.
  await db
    .delete(variants)
    .where(and(eq(variants.itemId, itemId()), sql`${variants.size} <> 'M'`))
}

beforeEach(clearTestRows)

describe('supply_route_items renamed catalog columns (#6)', () => {
  it('exposes item_id and color_id (not the old product_* names)', async () => {
    // Insert via the renamed Drizzle keys — fails to compile if the schema
    // still names the columns `productId` / `productColorId`.
    const [route] = await db
      .insert(supplyRoutes)
      .values({ name: 'SV-Route-rename', status: 'planning' })
      .returning()

    const [row] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: route.id,
        supplierId: supplierId(),
        itemId: itemId(),
        colorId: colorId(),
        size: 'M',
        quantity: 5,
        unitPriceForeign: '10',
        totalAmountForeign: '50',
        totalCostUgx: '500',
      })
      .returning()

    expect(row.itemId).toBe(itemId())
    expect(row.colorId).toBe(colorId())
    // The old keys should not exist on the row type.
    expect((row as Record<string, unknown>).productId).toBeUndefined()
    expect((row as Record<string, unknown>).productColorId).toBeUndefined()
  })
})

describe('addStoreOpeningBalance / addShopOpeningBalance — variantId input (#6)', () => {
  it('addStoreOpeningBalance accepts cells keyed by variantId', async () => {
    await callServerFn(() =>
      addStoreOpeningBalance({
        data: {
          items: [
            {
              itemId: itemId(),
              unitCostUgx: '10000',
              cells: [{ variantId: variantId(), quantity: 7 }],
            },
          ],
        },
      }),
    )
    const rows = await db
      .select()
      .from(storeStock)
      .where(
        and(
          eq(storeStock.storeId, storeId()),
          eq(storeStock.variantId, variantId()),
        ),
      )
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityOnHand).toBe(7)
  })

  it('addShopOpeningBalance accepts cells keyed by variantId', async () => {
    await callServerFn(() =>
      addShopOpeningBalance({
        data: {
          shopId: shopId(),
          items: [
            {
              itemId: itemId(),
              unitCostUgx: '12000',
              cells: [{ variantId: variantId(), quantity: 4 }],
            },
          ],
        },
      }),
    )
    const rows = await db
      .select()
      .from(shopStock)
      .where(
        and(
          eq(shopStock.shopId, shopId()),
          eq(shopStock.variantId, variantId()),
        ),
      )
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityOnHand).toBe(4)
  })
})

describe('receiveGoods — variant resolution + audit metadata (#6)', () => {
  it('auto-creates a variant when the supply line is full but the variant does not exist yet', async () => {
    const [route] = await db
      .insert(supplyRoutes)
      .values({
        name: 'SV-Route-autocreate',
        status: 'in_transit',
        departureDate: '2026-01-01',
      })
      .returning()
    const [sri] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: route.id,
        supplierId: supplierId(),
        itemId: itemId(),
        colorId: colorId(),
        size: 'L', // declared in items.sizes — but no matching variant row yet
        quantity: 3,
        unitPriceForeign: '10',
        totalAmountForeign: '30',
        totalCostUgx: '30000',
      })
      .returning()

    // Pre-condition: no (Slate, L) variant exists.
    const existing = await db
      .select()
      .from(variants)
      .where(
        and(
          eq(variants.colorId, colorId()),
          eq(variants.size, 'L'),
        ),
      )
    expect(existing).toHaveLength(0)

    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId: route.id,
          items: [{ supplyRouteItemId: sri.id, quantityReceived: 3 }],
        },
      }),
    )

    // Post-condition: variant was materialised + stock landed against it.
    const created = await db
      .select()
      .from(variants)
      .where(
        and(
          eq(variants.colorId, colorId()),
          eq(variants.size, 'L'),
        ),
      )
    expect(created).toHaveLength(1)

    const stock = await db
      .select()
      .from(storeStock)
      .where(
        and(
          eq(storeStock.storeId, storeId()),
          eq(storeStock.variantId, created[0].id),
        ),
      )
    expect(stock).toHaveLength(1)
    expect(stock[0].quantityOnHand).toBe(3)
  })

  it('rejects aggregate/color-only supply lines — admin must split first', async () => {
    const [route] = await db
      .insert(supplyRoutes)
      .values({
        name: 'SV-Route-aggregate',
        status: 'in_transit',
        departureDate: '2026-01-01',
      })
      .returning()
    const [sri] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: route.id,
        supplierId: supplierId(),
        itemId: itemId(),
        // colorId + size both NULL — aggregate mode
        quantity: 5,
        unitPriceForeign: '10',
        totalAmountForeign: '50',
        totalCostUgx: '50000',
      })
      .returning()

    await expect(
      callServerFn(() =>
        receiveGoods({
          data: {
            supplyRouteId: route.id,
            items: [{ supplyRouteItemId: sri.id, quantityReceived: 5 }],
          },
        }),
      ),
    ).rejects.toThrow(/split/)
  })

  it('records (colorName, size) in the audit metadata.lines array', async () => {
    const [route] = await db
      .insert(supplyRoutes)
      .values({
        name: 'SV-Route-audit',
        status: 'in_transit',
        departureDate: '2026-01-01',
      })
      .returning()
    const [sri] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: route.id,
        supplierId: supplierId(),
        itemId: itemId(),
        colorId: colorId(),
        size: 'M',
        quantity: 2,
        unitPriceForeign: '10',
        totalAmountForeign: '20',
        totalCostUgx: '20000',
      })
      .returning()

    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId: route.id,
          items: [{ supplyRouteItemId: sri.id, quantityReceived: 2 }],
        },
      }),
    )

    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorUserId, TEST_USER_ID),
          eq(auditLogs.action, 'store.receiveGoods'),
        ),
      )
    expect(logs).toHaveLength(1)
    const meta = logs[0].metadata as { lines?: Array<{ colorName: string; size: string }> }
    expect(meta.lines).toBeDefined()
    expect(meta.lines).toContainEqual(
      expect.objectContaining({ colorName: 'Slate', size: 'M' }),
    )

    // articleNumbers stays for backwards compatibility (spec §6, audit logs)
    expect(logs[0].articleNumbers.length).toBeGreaterThan(0)
  })
})

