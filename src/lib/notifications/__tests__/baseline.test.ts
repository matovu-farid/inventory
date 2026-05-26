import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "#/db"
import {
  computeShopBaseline,
  computeStoreBaseline,
} from "#/lib/notifications/baseline"
import {
  items,
  itemColors,
  itemCategories,
  stores,
  storeStock,
  storeReceivings,
  storeTransfers,
  storeTransferItems,
  shops,
  supplyRoutes,
  supplyRouteItems,
  suppliers,
  user as userTable,
  variants,
} from "#/db/schema"
import { eq, inArray } from "drizzle-orm"

const ART = "ART-BASE-TEST"
const SIZE = "M"

async function seed() {
  const [u] = await db
    .insert(userTable)
    .values({
      id: "user-baseline-test",
      name: "Baseline Tester",
      email: "baseline@example.com",
      emailVerified: true,
      role: "admin",
    })
    .returning()

  const [supplier] = await db
    .insert(suppliers)
    .values({ name: "Test Supplier", type: "local" })
    .returning()
  const [uncat] = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, "Uncategorized"))
  const [product] = await db
    .insert(items)
    .values({
      articleNumber: ART,
      name: "Baseline Test Product",
      itemCategoryId: uncat.id,
    })
    .returning()
  const [pc] = await db
    .insert(itemColors)
    .values({
      itemId: product.id,
      colorName: "Red",
      colorHex: "#FF0000",
    })
    .returning()
  // Stock now references variant_id (issue #4); the baseline helpers
  // bridge the notifications domain (still on (color, size)) by joining
  // store_stock → variants. Seed a variant for the size under test.
  const [variant] = await db
    .insert(variants)
    .values({ itemId: product.id, colorId: pc.id, size: SIZE })
    .returning()
  const [store] = await db
    .insert(stores)
    .values({ name: "Test Store" })
    .returning()
  const [shop] = await db
    .insert(shops)
    .values({ name: "Test Shop" })
    .returning()
  return { user: u, supplier, product, pc, variant, store, shop }
}

let ctx: Awaited<ReturnType<typeof seed>>

beforeAll(async () => {
  ctx = await seed()
})

afterAll(async () => {
  // Delete in reverse FK order.
  // storeTransferItems cascade-delete when storeTransfers row is deleted.
  await db.delete(storeTransfers).where(eq(storeTransfers.storeId, ctx.store.id))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, ctx.store.id))
  await db.delete(storeStock).where(eq(storeStock.storeId, ctx.store.id))
  // supplyRouteItems are cascade-deleted when the route is deleted.
  // Delete the 4 routes inserted by the storeBaseline test.
  await db.delete(supplyRoutes).where(
    inArray(supplyRoutes.name, [
      "Test Route 1",
      "Test Route 2",
      "Test Route 3",
      "Test Route 4",
    ]),
  )
  // variants reference itemColors on RESTRICT — clear first.
  await db.delete(variants).where(eq(variants.colorId, ctx.pc.id))
  await db.delete(itemColors).where(eq(itemColors.id, ctx.pc.id))
  await db.delete(items).where(eq(items.id, ctx.product.id))
  await db.delete(shops).where(eq(shops.id, ctx.shop.id))
  await db.delete(stores).where(eq(stores.id, ctx.store.id))
  await db.delete(suppliers).where(eq(suppliers.id, ctx.supplier.id))
  await db.delete(userTable).where(eq(userTable.id, ctx.user.id))
})

describe("computeStoreBaseline", () => {
  it("returns null baseline + sampleCount 0 when no receivings exist", async () => {
    const out = await computeStoreBaseline(db, {
      storeId: ctx.store.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out).toEqual({ baseline: null, sampleCount: 0 })
  })

  it("averages quantityReceived across last 3 receivings, ignoring older ones", async () => {
    // Each receiving needs its own supplyRoute + supplyRouteItem because of the
    // unique constraint uq_sri_variant on (supplyRouteId, supplierId, productColorId, size).
    const quantities = [100, 50, 80, 200]
    const routeNames = [
      "Test Route 1",
      "Test Route 2",
      "Test Route 3",
      "Test Route 4",
    ]
    const routeItems: { id: string }[] = []

    for (let i = 0; i < quantities.length; i++) {
      const qty = quantities[i]
      const [route] = await db
        .insert(supplyRoutes)
        .values({ name: routeNames[i], status: "received" })
        .returning()
      const [item] = await db
        .insert(supplyRouteItems)
        .values({
          supplyRouteId: route.id,
          supplierId: ctx.supplier.id,
          productId: ctx.product.id,
          productColorId: ctx.pc.id,
          size: SIZE,
          quantity: qty,
          unitPriceForeign: "10",
          totalAmountForeign: String(qty * 10),
          totalCostUgx: String(qty * 10000),
        })
        .returning()
      routeItems.push(item)
    }

    // Insert receivings with explicit dates so ordering is deterministic.
    // Dates: Jan 1 (qty=100), Jan 2 (qty=50), Jan 3 (qty=80), Jan 4 (qty=200)
    // Last 3 by DESC date: Jan 4 (200), Jan 3 (80), Jan 2 (50) → avg = (200+80+50)/3
    for (let i = 0; i < quantities.length; i++) {
      await db.insert(storeReceivings).values({
        storeId: ctx.store.id,
        supplyRouteItemId: routeItems[i].id,
        receivedDate: new Date(2026, 0, i + 1),
        quantityExpected: quantities[i],
        quantityReceived: quantities[i],
        receivedBy: ctx.user.id,
      })
    }

    const out = await computeStoreBaseline(db, {
      storeId: ctx.store.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out.sampleCount).toBe(3)
    expect(out.baseline).toBeCloseTo((50 + 80 + 200) / 3, 5)
  })
})

describe("computeShopBaseline", () => {
  it("returns null baseline + sampleCount 0 when no transfers exist", async () => {
    const out = await computeShopBaseline(db, {
      shopId: ctx.shop.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out).toEqual({ baseline: null, sampleCount: 0 })
  })

  it("uses quantityReceived when transfer is received, dispatched otherwise", async () => {
    const [ss] = await db
      .insert(storeStock)
      .values({
        storeId: ctx.store.id,
        variantId: ctx.variant.id,
        quantityOnHand: 1000,
        costPerUnitUgx: "1000",
        minimumSellPriceUgx: "1500",
      })
      .returning()

    // Transfer 1: status=received — use quantityReceived=50 (not quantityDispatched=60)
    const [t1] = await db
      .insert(storeTransfers)
      .values({
        storeId: ctx.store.id,
        shopId: ctx.shop.id,
        transferDate: new Date(2026, 1, 1),
        status: "received",
      })
      .returning()
    await db.insert(storeTransferItems).values({
      storeTransferId: t1.id,
      storeStockId: ss.id,
      quantityDispatched: 60,
      quantityReceived: 50,
      unitPriceUgx: "1500",
      totalPriceUgx: "90000",
    })

    // Transfer 2: status=dispatched — quantityReceived is null, use quantityDispatched=70
    const [t2] = await db
      .insert(storeTransfers)
      .values({
        storeId: ctx.store.id,
        shopId: ctx.shop.id,
        transferDate: new Date(2026, 1, 5),
        status: "dispatched",
      })
      .returning()
    await db.insert(storeTransferItems).values({
      storeTransferId: t2.id,
      storeStockId: ss.id,
      quantityDispatched: 70,
      quantityReceived: null,
      unitPriceUgx: "1500",
      totalPriceUgx: "105000",
    })

    const out = await computeShopBaseline(db, {
      shopId: ctx.shop.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out.sampleCount).toBe(2)
    expect(out.baseline).toBeCloseTo((50 + 70) / 2, 5)
  })
})
