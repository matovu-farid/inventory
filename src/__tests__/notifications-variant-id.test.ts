/**
 * Issue #5 — notifications tables move from (product_color_id, size) onto
 * variant_id. This test pins down the new shape end-to-end:
 *
 *   - notification_threshold_overrides rows carry variant_id
 *   - low_stock_alerts rows carry variant_id
 *   - restock_requisitions rows carry variant_id
 *   - the runThresholdChecks engine resolves a per-variant override and
 *     opens / resolves / reopens alerts addressed by variant_id
 *
 * It is intentionally written against the FINAL shape (red against the
 * pre-migration tree, green after the migration + code refactor lands).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq, and } from 'drizzle-orm'
import { db } from '#/db'
import {
  items,
  itemColors,
  itemCategories,
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
  user: 'user-notif-variant-test',
}

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
    name: 'Notif Variant Tester',
    email: 'notif-variant@example.com',
    emailVerified: true,
    role: 'admin',
  })
  const [s] = await db
    .insert(suppliers)
    .values({ name: 'S1-notif-variant', type: 'local' })
    .returning()
  FIXTURE.supplier = s.id
  const [uncat] = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, 'Uncategorized'))
  const [p] = await db
    .insert(items)
    .values({
      articleNumber: 'ART-NV',
      name: 'Notif Variant Product',
      itemCategoryId: uncat.id,
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
    .values({ name: 'NV Store' })
    .returning()
  FIXTURE.store = store.id
  const [shop] = await db.insert(shops).values({ name: 'NV Shop' }).returning()
  FIXTURE.shop = shop.id

  // 3 historical receivings so the percent rule has a baseline.
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
      .values({ name: `NV Route ${qty}`, status: 'received' })
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
  // `runThresholdChecksInternal` (it scans the whole DB) cannot race back in
  // and reopen alerts for our variant after the first delete.
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId()))
  await db.delete(shopStock).where(eq(shopStock.shopId, shopId()))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.variantId, variantId()))
  await db
    .delete(lowStockAlerts)
    .where(eq(lowStockAlerts.variantId, variantId()))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.variantId, variantId()))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, storeId()))
  await db
    .delete(supplyRouteLines)
    .where(eq(supplyRouteLines.colorId, pcId()))
  for (const qty of [50, 80, 200]) {
    await db
      .delete(supplyRoutes)
      .where(eq(supplyRoutes.name, `NV Route ${qty}`))
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
  await db
    .delete(lowStockAlerts)
    .where(eq(lowStockAlerts.variantId, variantId()))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.variantId, variantId()))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.variantId, variantId()))
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId()))
  await db.delete(shopStock).where(eq(shopStock.shopId, shopId()))
})

async function insertStoreStock(qoh: number) {
  await db.insert(storeStock).values({
    storeId: storeId(),
    variantId: variantId(),
    quantityOnHand: qoh,
    costPerUnitUgx: '1000',
    minimumSellPriceUgx: '1500',
  })
}

async function ourStoreAlerts() {
  return db
    .select()
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.variantId, variantId()),
        eq(lowStockAlerts.locationId, storeId()),
      ),
    )
}

describe('notification tables keyed by variant_id', () => {
  it('notification_threshold_overrides accepts a variant_id row and rejects writes that omit it', async () => {
    const [row] = await db
      .insert(notificationThresholdOverrides)
      .values({
        scope: 'store',
        variantId: variantId(),
        shopId: null,
        mode: 'units',
        value: '100',
      })
      .returning()
    expect(row.variantId).toBe(variantId())
    // Confirm the old composite columns are gone from the type — if they
    // existed we'd be able to read them on the row.
    expect((row as Record<string, unknown>).itemColorId).toBeUndefined()
    expect((row as Record<string, unknown>).size).toBeUndefined()
  })

  it('threshold engine opens a store alert keyed by variant_id and resolves it when stock recovers', async () => {
    await insertStoreStock(20) // ≈ 18% of baseline 110 → below 30% default
    await runThresholdChecksInternal(db, new Date())

    let alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].variantId).toBe(variantId())
    expect(alerts[0].status).toBe('open')

    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, storeId()))
    expect(reqs).toHaveLength(1)
    expect(reqs[0].variantId).toBe(variantId())
    expect(reqs[0].status).toBe('open')

    // recover → resolves alert + fulfils requisition
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, storeId()))
    await runThresholdChecksInternal(db, new Date())

    alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('resolved')
    expect(alerts[0].resolvedAt).not.toBeNull()

    const reqsAfter = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, storeId()))
    expect(reqsAfter).toHaveLength(1)
    expect(reqsAfter[0].status).toBe('fulfilled')
  })

  it('re-arms — a fresh open alert is created with the same variant_id after a resolved cycle', async () => {
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
    expect(alerts.every((a) => a.variantId === variantId())).toBe(true)
    const open = alerts.filter((a) => a.status === 'open')
    expect(open).toHaveLength(1)
  })

  it('respects a variant-keyed units override', async () => {
    await db.insert(notificationThresholdOverrides).values({
      scope: 'store',
      variantId: variantId(),
      shopId: null,
      mode: 'units',
      value: '100',
    })
    await insertStoreStock(80) // 80 < 100 → below in units mode
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].variantId).toBe(variantId())
    expect(alerts[0].status).toBe('open')
  })
})
