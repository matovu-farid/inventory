/**
 * Plan 2a / Task 6: `pickStoreStockFifo` helper.
 *
 * Six scenarios, each driving the helper against a real test DB lot
 * mix (single resolved, unresolved-before-variant, same-group oldest-
 * wins, shortfall, variant filter skips unresolved, zero-qty no-op).
 */

import { describe, it, expect, beforeEach } from "vitest"

import { db } from "#/db"
import { pickStoreStockFifo } from "#/server/functions/store/fifo"
import {
  resetTestDb,
  seedColor,
  seedItem,
  seedStore,
  seedStoreStockLot,
  seedSupplyRouteLine,
} from "./test-helpers"

describe("pickStoreStockFifo — unresolved-first FIFO", () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it("drains a single resolved lot when variantId is provided", async () => {
    const itemId = await seedItem({ articleNumber: "T1", name: "Tee" })
    const colorId = await seedColor({
      itemId,
      colorName: "Red",
      colorHex: "#f00",
    })
    const storeId = await seedStore()
    const lineId = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const { stockId, variantId } = await seedStoreStockLot({
      storeId,
      itemId,
      colorId,
      size: "M",
      supplyRouteLineId: lineId,
      quantity: 10,
      costPerUnitUgx: "100.00",
    })

    expect(variantId).not.toBeNull()
    const plan = await pickStoreStockFifo(db, {
      storeId,
      itemId,
      variantId: variantId as string,
      quantity: 4,
    })

    expect(plan.allocations).toEqual([
      {
        storeStockId: stockId,
        quantity: 4,
        costPerUnitUgx: "100.00",
        supplyRouteLineId: lineId,
      },
    ])
    expect(plan.shortfall).toBe(0)
  })

  it("when variantId omitted: drains unresolved lot before any variant lot", async () => {
    const itemId = await seedItem({ articleNumber: "T2", name: "Tee" })
    const colorId = await seedColor({
      itemId,
      colorName: "Red",
      colorHex: "#f00",
    })
    const storeId = await seedStore()
    // Older variant line + newer unresolved line: under pure age FIFO
    // the variant lot would win, but unresolved-first overrides that.
    const oldVariantLine = await seedSupplyRouteLine({
      itemId,
      colorId,
      size: "M",
      createdAt: "2026-01-01",
    })
    const newUnresolvedLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: "2026-03-01",
    })

    const { stockId: variantStock } = await seedStoreStockLot({
      storeId,
      itemId,
      colorId,
      size: "M",
      supplyRouteLineId: oldVariantLine,
      quantity: 10,
      costPerUnitUgx: "100.00",
    })
    const { stockId: unresolvedStock } = await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: newUnresolvedLine,
      quantity: 5,
      costPerUnitUgx: "120.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId,
      itemId,
      quantity: 8,
    })

    // Unresolved first (5), then oldest variant lot (3).
    expect(plan.allocations).toHaveLength(2)
    expect(plan.allocations[0]).toMatchObject({
      storeStockId: unresolvedStock,
      quantity: 5,
    })
    expect(plan.allocations[1]).toMatchObject({
      storeStockId: variantStock,
      quantity: 3,
    })
    expect(plan.shortfall).toBe(0)
  })

  it("within each group, oldest supply line wins", async () => {
    const itemId = await seedItem({ articleNumber: "T3", name: "Tee" })
    await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    // Two unresolved lots — older line then newer line.
    const olderLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: "2026-01-01",
    })
    const newerLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
      createdAt: "2026-02-01",
    })
    const { stockId: older } = await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: olderLine,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })
    const { stockId: newer } = await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: newerLine,
      quantity: 5,
      costPerUnitUgx: "110.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId,
      itemId,
      quantity: 7,
    })

    expect(plan.allocations[0]).toMatchObject({
      storeStockId: older,
      quantity: 5,
    })
    expect(plan.allocations[1]).toMatchObject({
      storeStockId: newer,
      quantity: 2,
    })
    expect(plan.shortfall).toBe(0)
  })

  it("reports shortfall when total on-hand < requested", async () => {
    const itemId = await seedItem({ articleNumber: "T4", name: "Tee" })
    const storeId = await seedStore()
    const lineId = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: lineId,
      quantity: 3,
      costPerUnitUgx: "100.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId,
      itemId,
      quantity: 10,
    })
    expect(plan.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(3)
    expect(plan.shortfall).toBe(7)
  })

  it("variantId filter skips unresolved lots", async () => {
    const itemId = await seedItem({ articleNumber: "T5", name: "Tee" })
    const colorId = await seedColor({
      itemId,
      colorName: "Red",
      colorHex: "#f00",
    })
    const storeId = await seedStore()
    const variantLine = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const unresolvedLine = await seedSupplyRouteLine({
      itemId,
      colorId: null,
      size: null,
    })
    const { stockId: vStock, variantId } = await seedStoreStockLot({
      storeId,
      itemId,
      colorId,
      size: "M",
      supplyRouteLineId: variantLine,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId,
      itemId,
      variantId: null,
      supplyRouteLineId: unresolvedLine,
      quantity: 10,
      costPerUnitUgx: "120.00",
    })

    expect(variantId).not.toBeNull()
    const plan = await pickStoreStockFifo(db, {
      storeId,
      itemId,
      variantId: variantId as string,
      quantity: 3,
    })

    expect(plan.allocations).toEqual([
      {
        storeStockId: vStock,
        quantity: 3,
        costPerUnitUgx: "100.00",
        supplyRouteLineId: variantLine,
      },
    ])
    expect(plan.shortfall).toBe(0)
  })

  it("returns no allocations when quantity = 0", async () => {
    const itemId = await seedItem({ articleNumber: "T6", name: "Tee" })
    const storeId = await seedStore()

    const plan = await pickStoreStockFifo(db, {
      storeId,
      itemId,
      quantity: 0,
    })

    expect(plan.allocations).toEqual([])
    expect(plan.shortfall).toBe(0)
  })
})
