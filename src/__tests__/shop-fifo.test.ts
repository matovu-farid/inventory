/**
 * Plan 2b / Task 1: `pickShopStockFifo` helper — mirror of
 * `pickStoreStockFifo` for shop_stock. Same unresolved-first FIFO rules.
 */

import { describe, it, expect, beforeEach } from 'vitest'

import { db } from '#/db'
import { pickShopStockFifo } from '#/server/functions/shop/fifo'
import {
  resetTestDb,
  seedColor,
  seedItem,
  seedShop,
  seedShopStockLot,
  seedSupplyRouteLine,
} from './test-helpers'

describe('pickShopStockFifo — unresolved-first FIFO', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it('drains a single resolved lot when variantId is provided', async () => {
    const itemId = await seedItem({ articleNumber: 'T1', name: 'Tee' })
    const colorId = await seedColor({
      itemId,
      colorName: 'Red',
      colorHex: '#f00',
    })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({ itemId, colorId, size: 'M' })
    const { stockId, variantId } = await seedShopStockLot({
      shopId,
      itemId,
      colorId,
      size: 'M',
      supplyRouteLineId: lineId,
      quantity: 10,
      costPerUnitUgx: '100.00',
    })

    expect(variantId).not.toBeNull()
    const plan = await pickShopStockFifo(db, {
      shopId,
      itemId,
      variantId: variantId as string,
      quantity: 4,
    })

    expect(plan.allocations).toEqual([
      {
        shopStockId: stockId,
        quantity: 4,
        costPerUnitUgx: '100.00',
        minimumSellPriceUgx: '0.00',
        supplyRouteLineId: lineId,
      },
    ])
    expect(plan.shortfall).toBe(0)
  })

  it('when variantId omitted: drains unresolved lot before any variant lot', async () => {
    const itemId = await seedItem({ articleNumber: 'T2', name: 'Tee' })
    const colorId = await seedColor({
      itemId,
      colorName: 'Red',
      colorHex: '#f00',
    })
    const shopId = await seedShop()
    const oldVariantLine = await seedSupplyRouteLine({
      itemId,
      colorId,
      size: 'M',
      createdAt: '2026-01-01',
    })
    const newUnresolvedLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: '2026-03-01',
    })

    const { stockId: variantStock } = await seedShopStockLot({
      shopId,
      itemId,
      colorId,
      size: 'M',
      supplyRouteLineId: oldVariantLine,
      quantity: 10,
      costPerUnitUgx: '100.00',
    })
    const { stockId: unresolvedStock } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: newUnresolvedLine,
      quantity: 5,
      costPerUnitUgx: '120.00',
    })

    const plan = await pickShopStockFifo(db, {
      shopId,
      itemId,
      quantity: 8,
    })

    expect(plan.allocations).toHaveLength(2)
    expect(plan.allocations[0]).toMatchObject({
      shopStockId: unresolvedStock,
      quantity: 5,
    })
    expect(plan.allocations[1]).toMatchObject({
      shopStockId: variantStock,
      quantity: 3,
    })
    expect(plan.shortfall).toBe(0)
  })

  it('within each group, oldest supply line wins', async () => {
    const itemId = await seedItem({ articleNumber: 'T3', name: 'Tee' })
    await seedColor({ itemId, colorName: 'Red', colorHex: '#f00' })
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
    const { stockId: older } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: olderLine,
      quantity: 5,
      costPerUnitUgx: '100.00',
    })
    const { stockId: newer } = await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: newerLine,
      quantity: 5,
      costPerUnitUgx: '110.00',
    })

    const plan = await pickShopStockFifo(db, {
      shopId,
      itemId,
      quantity: 7,
    })

    expect(plan.allocations[0]).toMatchObject({
      shopStockId: older,
      quantity: 5,
    })
    expect(plan.allocations[1]).toMatchObject({
      shopStockId: newer,
      quantity: 2,
    })
    expect(plan.shortfall).toBe(0)
  })

  it('reports shortfall when total on-hand < requested', async () => {
    const itemId = await seedItem({ articleNumber: 'T4', name: 'Tee' })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: lineId,
      quantity: 3,
      costPerUnitUgx: '100.00',
    })

    const plan = await pickShopStockFifo(db, {
      shopId,
      itemId,
      quantity: 10,
    })
    expect(plan.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(3)
    expect(plan.shortfall).toBe(7)
  })

  it('variantId filter skips unresolved lots', async () => {
    const itemId = await seedItem({ articleNumber: 'T5', name: 'Tee' })
    const colorId = await seedColor({
      itemId,
      colorName: 'Red',
      colorHex: '#f00',
    })
    const shopId = await seedShop()
    const variantLine = await seedSupplyRouteLine({
      itemId,
      colorId,
      size: 'M',
    })
    const unresolvedLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    const { stockId: vStock, variantId } = await seedShopStockLot({
      shopId,
      itemId,
      colorId,
      size: 'M',
      supplyRouteLineId: variantLine,
      quantity: 5,
      costPerUnitUgx: '100.00',
    })
    await seedShopStockLot({
      shopId,
      itemId,
      variantId: null,
      supplyRouteLineId: unresolvedLine,
      quantity: 10,
      costPerUnitUgx: '120.00',
    })

    expect(variantId).not.toBeNull()
    const plan = await pickShopStockFifo(db, {
      shopId,
      itemId,
      variantId: variantId as string,
      quantity: 3,
    })

    expect(plan.allocations).toEqual([
      {
        shopStockId: vStock,
        quantity: 3,
        costPerUnitUgx: '100.00',
        minimumSellPriceUgx: '0.00',
        supplyRouteLineId: variantLine,
      },
    ])
    expect(plan.shortfall).toBe(0)
  })

  it('returns no allocations when quantity = 0', async () => {
    const itemId = await seedItem({ articleNumber: 'T6', name: 'Tee' })
    const shopId = await seedShop()

    const plan = await pickShopStockFifo(db, {
      shopId,
      itemId,
      quantity: 0,
    })

    expect(plan.allocations).toEqual([])
    expect(plan.shortfall).toBe(0)
  })
})
