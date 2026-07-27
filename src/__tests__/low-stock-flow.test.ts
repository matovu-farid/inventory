import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { db } from '#/db'
import {
  items,
  itemColors,
  variants,
  stores,
  storeStock,
  storeReceivings,
  shops,
  shopStock,
  supplyRoutes,
  supplyRouteLines,
  suppliers,
  user as userTable,
  lowStockAlerts,
  restockRequisitions,
  notificationThresholdOverrides,
} from '#/db/schema'
import { runThresholdChecksInternal } from '#/server/scheduled/run-threshold-checks'
import { assertDefined } from './test-helpers'

interface Fixture {
  user: string
  supplier?: string
  product?: string
  pc?: string
  variant?: string
  store?: string
  shop?: string
}

const FIXTURE: Fixture = {
  user: 'user-lowstock-test',
}

// Narrowing accessors so we don't sprinkle `!` non-null assertions everywhere.
// Each getter throws a clear error if `seed()` hasn't run, which is also a
// real failure mode worth surfacing.
function pcId(): string {
  assertDefined(FIXTURE.pc, 'FIXTURE.pc not seeded')
  return FIXTURE.pc
}
function variantId(): string {
  assertDefined(FIXTURE.variant, 'FIXTURE.variant not seeded')
  return FIXTURE.variant
}
function storeId(): string {
  assertDefined(FIXTURE.store, 'FIXTURE.store not seeded')
  return FIXTURE.store
}
function shopId(): string {
  assertDefined(FIXTURE.shop, 'FIXTURE.shop not seeded')
  return FIXTURE.shop
}
function itemId(): string {
  assertDefined(FIXTURE.product, 'FIXTURE.product not seeded')
  return FIXTURE.product
}
function supplierId(): string {
  assertDefined(FIXTURE.supplier, 'FIXTURE.supplier not seeded')
  return FIXTURE.supplier
}
const SIZE = 'M'

async function seed() {
  await db.insert(userTable).values({
    id: FIXTURE.user,
    name: 'LowStock Tester',
    email: 'lowstock@example.com',
    emailVerified: true,
    role: 'admin',
  })
  const [s] = await db
    .insert(suppliers)
    .values({ name: 'S1-lowstock', type: 'local' })
    .returning()
  FIXTURE.supplier = s.id
  const [p] = await db
    .insert(items)
    .values({
      articleNumber: 'ART-LS',
      name: 'LS Product',
      category: 'Test',
    })
    .returning()
  FIXTURE.product = p.id
  const [pc] = await db
    .insert(itemColors)
    .values({ itemId: p.id, colorName: 'Red', colorHex: '#F00' })
    .returning()
  FIXTURE.pc = pc.id
  const [v] = await db
    .insert(variants)
    .values({ itemId: p.id, colorId: pc.id, size: SIZE })
    .returning()
  FIXTURE.variant = v.id
  const [store] = await db
    .insert(stores)
    .values({ name: 'LS Store' })
    .returning()
  FIXTURE.store = store.id
  const [shop] = await db.insert(shops).values({ name: 'LS Shop' }).returning()
  FIXTURE.shop = shop.id

  // 3 historical receivings via separate routes (uq_sri_variant constraint).
  // avg = (50+80+200)/3 ≈ 110
  const dates = [
    new Date(2026, 0, 1),
    new Date(2026, 0, 2),
    new Date(2026, 0, 3),
  ]
  let idx = 0
  for (const qty of [50, 80, 200]) {
    const [route] = await db
      .insert(supplyRoutes)
      .values({ name: `LS Route ${qty}`, status: 'received' })
      .returning()
    const [item] = await db
      .insert(supplyRouteLines)
      .values({
        supplyRouteId: route.id,
        supplierId: s.id,
        itemId: p.id,
        colorId: pc.id,
        size: SIZE,
        quantity: qty,
        unitPriceForeign: '10',
        totalAmountForeign: String(qty * 10),
        totalCostUgx: String(qty * 10000),
      })
      .returning()
    await db.insert(storeReceivings).values({
      storeId: store.id,
      supplyRouteLineId: item.id,
      receivedDate: dates[idx++],
      quantityExpected: qty,
      quantityReceived: qty,
      receivedBy: FIXTURE.user,
    })
  }
}

async function cleanup() {
  // Order: drop stock + override rules first so any parallel test calling
  // `runThresholdChecksInternal` (it scans the whole DB) cannot race back
  // in and reopen alerts for our variant after the first delete.
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId()))
  await db.delete(shopStock).where(eq(shopStock.shopId, shopId()))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.itemId, itemId()))
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.itemId, itemId()))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.itemId, itemId()))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, storeId()))
  await db.delete(supplyRouteLines).where(eq(supplyRouteLines.colorId, pcId()))
  // Drop routes by name pattern (we created 3)
  for (const qty of [50, 80, 200]) {
    await db
      .delete(supplyRoutes)
      .where(eq(supplyRoutes.name, `LS Route ${qty}`))
  }
  await db.delete(variants).where(eq(variants.id, variantId()))
  await db.delete(itemColors).where(eq(itemColors.id, pcId()))
  await db.delete(items).where(eq(items.id, itemId()))
  await db.delete(shops).where(eq(shops.id, shopId()))
  await db.delete(stores).where(eq(stores.id, storeId()))
  await db.delete(suppliers).where(eq(suppliers.id, supplierId()))
  await db.delete(userTable).where(eq(userTable.id, FIXTURE.user))
}

beforeAll(seed)
afterAll(cleanup)

beforeEach(async () => {
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.itemId, itemId()))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.itemId, itemId()))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.itemId, itemId()))
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId()))
  await db.delete(shopStock).where(eq(shopStock.shopId, shopId()))
})

async function insertStoreStock(qoh: number) {
  await db.insert(storeStock).values({
    storeId: storeId(),
    itemId: itemId(),
    variantId: variantId(),
    quantityOnHand: qoh,
    costPerUnitUgx: '1000',
  })
}

async function insertShopStock(qoh: number) {
  await db.insert(shopStock).values({
    shopId: shopId(),
    itemId: itemId(),
    variantId: variantId(),
    quantityOnHand: qoh,
    costPerUnitUgx: '1500',
  })
}

// Helper: get our fixture's store alerts filtered by location.
async function ourStoreAlerts() {
  return db
    .select()
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.itemId, itemId()),
        eq(lowStockAlerts.locationId, storeId()),
      ),
    )
}

// Helper: get our fixture's shop alerts filtered by location.
async function ourShopAlerts() {
  return db
    .select()
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.itemId, itemId()),
        eq(lowStockAlerts.locationId, shopId()),
      ),
    )
}

describe('runThresholdChecksInternal', () => {
  it('opens a store alert + requisition when below 30% of baseline', async () => {
    await insertStoreStock(20) // 20 / 110 ≈ 18% < 30%
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('open')
    expect(alerts[0].quantityAtOpen).toBe(20)
    expect(alerts[0].thresholdSnapshot).toEqual({ mode: 'percent', value: 30 })

    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, storeId()))
    expect(reqs).toHaveLength(1)
    expect(reqs[0].suggestedQuantity).toBe(110 - 20)
  })

  it('is idempotent — running twice does not create duplicate alerts', async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('open')
  })

  it('resolves alert and fulfils requisition when stock recovers', async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, storeId()))
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('resolved')
    expect(alerts[0].resolvedAt).not.toBeNull()

    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, storeId()))
    expect(reqs).toHaveLength(1)
    expect(reqs[0].status).toBe('fulfilled')
  })

  it('re-arms — alert opens fresh after a resolved cycle drops below again', async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, storeId()))
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 10 })
      .where(eq(storeStock.storeId, storeId()))
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(2)
    expect(alerts.filter((a) => a.status === 'open')).toHaveLength(1)
  })

  it('respects a variant-specific units override that bypasses percent rule', async () => {
    await db.insert(notificationThresholdOverrides).values({
      scope: 'store',
      itemId: itemId(),
      variantId: variantId(),
      shopId: null,
      mode: 'units',
      value: '100',
    })
    await insertStoreStock(80) // 80 < 100 → below in units mode
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('open')
  })

  it('opens a shop alert (no requisition) when shop stock is low', async () => {
    await insertShopStock(2)
    // No transfer history → baseline null → percent rule skips.
    // Add a units override so the rule fires.
    await db.insert(notificationThresholdOverrides).values({
      scope: 'shop',
      itemId: itemId(),
      variantId: variantId(),
      shopId: null,
      mode: 'units',
      value: '5',
    })
    await runThresholdChecksInternal(db, new Date())

    const shopAlerts = await ourShopAlerts()
    expect(shopAlerts).toHaveLength(1)
    expect(shopAlerts[0].status).toBe('open')

    // No requisition should be created for shop alerts.
    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.itemId, itemId()))
    expect(reqs).toHaveLength(0)
  })
})
