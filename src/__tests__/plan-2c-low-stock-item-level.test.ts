/**
 * Plan 2c Task 9 — End-to-end smoke for item-level low-stock alerts.
 *
 * Confirms that unresolved + variant lots all roll up into a single
 * item-level total before the threshold check fires, and that the
 * alert/requisition write item_id directly.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { eq, and } from 'drizzle-orm'

import { db } from '#/db'
import {
  items,
  itemColors,
  variants,
  stores,
  storeStock,
  supplyRoutes,
  supplyRouteLines,
  storeReceivings,
  suppliers,
  lowStockAlerts,
  restockRequisitions,
  notificationThresholdOverrides,
  user as userTable,
} from '#/db/schema'
import { runThresholdChecksInternal } from '#/server/scheduled/run-threshold-checks'

const USER_ID = 'user-plan2c-smoke'
let itemId = ''
let storeId = ''
let supplierId = ''

async function seed() {
  await db.delete(userTable).where(eq(userTable.id, USER_ID))
  await db.insert(userTable).values({
    id: USER_ID,
    name: 'Plan 2c Smoke',
    email: 'plan2c-smoke@example.com',
    emailVerified: true,
    role: 'admin',
  })
  const [s] = await db
    .insert(suppliers)
    .values({ name: 'S-p2c', type: 'local' })
    .returning()
  supplierId = s.id
  const [item] = await db
    .insert(items)
    .values({ articleNumber: 'P2C-1', name: 'Polo', category: 'Test' })
    .returning()
  itemId = item.id
  const [store] = await db.insert(stores).values({ name: 'P2C Store' }).returning()
  storeId = store.id

  // Three historical receivings → baseline avg 100
  const dates = [new Date(2026, 0, 1), new Date(2026, 0, 2), new Date(2026, 0, 3)]
  let idx = 0
  for (const qty of [80, 100, 120]) {
    const [route] = await db
      .insert(supplyRoutes)
      .values({ name: `P2C Route ${qty}`, status: 'received' })
      .returning()
    const [line] = await db
      .insert(supplyRouteLines)
      .values({
        supplyRouteId: route.id,
        supplierId: s.id,
        itemId: item.id,
        colorId: null,
        size: null,
        quantity: qty,
        unitPriceForeign: '10',
        totalAmountForeign: String(qty * 10),
        totalCostUgx: String(qty * 10000),
      })
      .returning()
    await db.insert(storeReceivings).values({
      storeId: store.id,
      supplyRouteLineId: line.id,
      receivedDate: dates[idx++],
      quantityExpected: qty,
      quantityReceived: qty,
      receivedBy: USER_ID,
    })
  }
}

async function cleanup() {
  if (!itemId) return
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId))
  await db.delete(notificationThresholdOverrides).where(eq(notificationThresholdOverrides.itemId, itemId))
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.itemId, itemId))
  await db.delete(restockRequisitions).where(eq(restockRequisitions.itemId, itemId))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, storeId))
  await db.delete(supplyRouteLines).where(eq(supplyRouteLines.itemId, itemId))
  for (const qty of [80, 100, 120]) {
    await db.delete(supplyRoutes).where(eq(supplyRoutes.name, `P2C Route ${qty}`))
  }
  await db.delete(variants).where(eq(variants.itemId, itemId))
  await db.delete(itemColors).where(eq(itemColors.itemId, itemId))
  await db.delete(items).where(eq(items.id, itemId))
  await db.delete(stores).where(eq(stores.id, storeId))
  await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  await db.delete(userTable).where(eq(userTable.id, USER_ID))
}

beforeAll(seed)
afterAll(cleanup)
beforeEach(async () => {
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.itemId, itemId))
  await db.delete(restockRequisitions).where(eq(restockRequisitions.itemId, itemId))
  await db.delete(storeStock).where(eq(storeStock.storeId, storeId))
})

describe('Plan 2c low-stock alerts — item-level', () => {
  it('aggregates unresolved + variant lots into a single item-level total', async () => {
    // Add an unresolved lot (10) and a variant lot (5) — total 15, well
    // below baseline 100 × 30% = 30 → should trip the percent rule.
    const [color] = await db.insert(itemColors)
      .values({ itemId, colorName: 'Red', colorHex: '#f00' })
      .returning()
    const [variant] = await db.insert(variants)
      .values({ itemId, colorId: color.id, size: 'M' })
      .returning()

    await db.insert(storeStock).values([
      { storeId, itemId, variantId: null, quantityOnHand: 10, costPerUnitUgx: '100' },
      { storeId, itemId, variantId: variant.id, quantityOnHand: 5, costPerUnitUgx: '100' },
    ])

    await runThresholdChecksInternal(db, new Date())

    const alerts = await db.query.lowStockAlerts.findMany({
      where: and(
        eq(lowStockAlerts.itemId, itemId),
        eq(lowStockAlerts.locationId, storeId),
      ),
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].itemId).toBe(itemId)
    expect(alerts[0].status).toBe('open')
    expect(alerts[0].quantityAtOpen).toBe(15)

    const reqs = await db.query.restockRequisitions.findMany({
      where: eq(restockRequisitions.itemId, itemId),
    })
    expect(reqs).toHaveLength(1)
    expect(reqs[0].itemId).toBe(itemId)
    expect(reqs[0].status).toBe('open')
  })

  it('resolves alert when item total recovers above threshold', async () => {
    await db.insert(storeStock).values({
      storeId, itemId, variantId: null, quantityOnHand: 5, costPerUnitUgx: '100',
    })
    await runThresholdChecksInternal(db, new Date())
    let alerts = await db.query.lowStockAlerts.findMany({
      where: and(
        eq(lowStockAlerts.itemId, itemId),
        eq(lowStockAlerts.locationId, storeId),
      ),
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('open')

    // Refill above threshold (100 × 30% = 30; set to 150 → safe).
    await db.update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, storeId))
    await runThresholdChecksInternal(db, new Date())

    alerts = await db.query.lowStockAlerts.findMany({
      where: and(
        eq(lowStockAlerts.itemId, itemId),
        eq(lowStockAlerts.locationId, storeId),
      ),
    })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe('resolved')

    const reqs = await db.query.restockRequisitions.findMany({
      where: eq(restockRequisitions.itemId, itemId),
    })
    expect(reqs[0].status).toBe('fulfilled')
  })
})
