import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { eq, and } from "drizzle-orm"
import { db } from "#/db"
import {
  products,
  productColors,
  stores,
  storeStock,
  storeReceivings,
  shops,
  shopStock,
  supplyRoutes,
  supplyRouteItems,
  suppliers,
  user as userTable,
  lowStockAlerts,
  restockRequisitions,
  notificationThresholdOverrides,
} from "#/db/schema"
import { runThresholdChecksInternal } from "#/server/scheduled/run-threshold-checks"

const FIXTURE = {
  user: "user-lowstock-test",
  supplier: undefined as string | undefined,
  product: undefined as string | undefined,
  pc: undefined as string | undefined,
  store: undefined as string | undefined,
  shop: undefined as string | undefined,
}
const SIZE = "M"

async function seed() {
  await db.insert(userTable).values({
    id: FIXTURE.user,
    name: "LowStock Tester",
    email: "lowstock@example.com",
    emailVerified: true,
    role: "admin",
  })
  const [s] = await db.insert(suppliers).values({ name: "S1-lowstock", type: "local" }).returning()
  FIXTURE.supplier = s.id
  const [p] = await db
    .insert(products)
    .values({ articleNumber: "ART-LS", name: "LS Product" })
    .returning()
  FIXTURE.product = p.id
  const [pc] = await db
    .insert(productColors)
    .values({ productId: p.id, colorName: "Red", colorHex: "#F00" })
    .returning()
  FIXTURE.pc = pc.id
  const [store] = await db.insert(stores).values({ name: "LS Store" }).returning()
  FIXTURE.store = store.id
  const [shop] = await db.insert(shops).values({ name: "LS Shop" }).returning()
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
      .values({ name: `LS Route ${qty}`, status: "received" })
      .returning()
    const [item] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: route.id,
        supplierId: s.id,
        productId: p.id,
        productColorId: pc.id,
        size: SIZE,
        quantity: qty,
        unitPriceForeign: "10",
        totalAmountForeign: String(qty * 10),
        totalCostUgx: String(qty * 10000),
      })
      .returning()
    await db.insert(storeReceivings).values({
      storeId: store.id,
      supplyRouteItemId: item.id,
      receivedDate: dates[idx++],
      quantityExpected: qty,
      quantityReceived: qty,
      receivedBy: FIXTURE.user,
    })
  }
}

async function cleanup() {
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.productColorId, FIXTURE.pc!))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.productColorId, FIXTURE.pc!))
  await db.delete(storeStock).where(eq(storeStock.storeId, FIXTURE.store!))
  await db.delete(shopStock).where(eq(shopStock.shopId, FIXTURE.shop!))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, FIXTURE.store!))
  await db
    .delete(supplyRouteItems)
    .where(eq(supplyRouteItems.productColorId, FIXTURE.pc!))
  // Drop routes by name pattern (we created 3)
  for (const qty of [50, 80, 200]) {
    await db.delete(supplyRoutes).where(eq(supplyRoutes.name, `LS Route ${qty}`))
  }
  await db.delete(productColors).where(eq(productColors.id, FIXTURE.pc!))
  await db.delete(products).where(eq(products.id, FIXTURE.product!))
  await db.delete(shops).where(eq(shops.id, FIXTURE.shop!))
  await db.delete(stores).where(eq(stores.id, FIXTURE.store!))
  await db.delete(suppliers).where(eq(suppliers.id, FIXTURE.supplier!))
  await db.delete(userTable).where(eq(userTable.id, FIXTURE.user))
}

beforeAll(seed)
afterAll(cleanup)

beforeEach(async () => {
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.productColorId, FIXTURE.pc!))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.productColorId, FIXTURE.pc!))
  await db.delete(storeStock).where(eq(storeStock.storeId, FIXTURE.store!))
  await db.delete(shopStock).where(eq(shopStock.shopId, FIXTURE.shop!))
})

async function insertStoreStock(qoh: number) {
  await db.insert(storeStock).values({
    storeId: FIXTURE.store!,
    productColorId: FIXTURE.pc!,
    size: SIZE,
    quantityOnHand: qoh,
    costPerUnitUgx: "1000",
    minimumSellPriceUgx: "1500",
  })
}

async function insertShopStock(qoh: number) {
  await db.insert(shopStock).values({
    shopId: FIXTURE.shop!,
    productColorId: FIXTURE.pc!,
    size: SIZE,
    quantityOnHand: qoh,
    costPerUnitUgx: "1500",
    minimumSellPriceUgx: "2000",
  })
}

// Helper: get our fixture's store alerts filtered by location.
async function ourStoreAlerts() {
  return db
    .select()
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.productColorId, FIXTURE.pc!),
        eq(lowStockAlerts.locationId, FIXTURE.store!),
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
        eq(lowStockAlerts.productColorId, FIXTURE.pc!),
        eq(lowStockAlerts.locationId, FIXTURE.shop!),
      ),
    )
}

describe("runThresholdChecksInternal", () => {
  it("opens a store alert + requisition when below 30% of baseline", async () => {
    await insertStoreStock(20) // 20 / 110 ≈ 18% < 30%
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe("open")
    expect(alerts[0].quantityAtOpen).toBe(20)
    expect(alerts[0].thresholdSnapshot).toEqual({ mode: "percent", value: 30 })

    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, FIXTURE.store!))
    expect(reqs).toHaveLength(1)
    expect(reqs[0].suggestedQuantity).toBe(110 - 20)
  })

  it("is idempotent — running twice does not create duplicate alerts", async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe("open")
  })

  it("resolves alert and fulfils requisition when stock recovers", async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, FIXTURE.store!))
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe("resolved")
    expect(alerts[0].resolvedAt).not.toBeNull()

    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, FIXTURE.store!))
    expect(reqs).toHaveLength(1)
    expect(reqs[0].status).toBe("fulfilled")
  })

  it("re-arms — alert opens fresh after a resolved cycle drops below again", async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, FIXTURE.store!))
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 10 })
      .where(eq(storeStock.storeId, FIXTURE.store!))
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(2)
    expect(alerts.filter((a) => a.status === "open")).toHaveLength(1)
  })

  it("respects a variant-specific units override that bypasses percent rule", async () => {
    await db.insert(notificationThresholdOverrides).values({
      scope: "store",
      productColorId: FIXTURE.pc!,
      size: SIZE,
      shopId: null,
      mode: "units",
      value: "100",
    })
    await insertStoreStock(80) // 80 < 100 → below in units mode
    await runThresholdChecksInternal(db, new Date())

    const alerts = await ourStoreAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe("open")
  })

  it("opens a shop alert (no requisition) when shop stock is low", async () => {
    await insertShopStock(2)
    // No transfer history → baseline null → percent rule skips.
    // Add a units override so the rule fires.
    await db.insert(notificationThresholdOverrides).values({
      scope: "shop",
      productColorId: FIXTURE.pc!,
      size: SIZE,
      shopId: null,
      mode: "units",
      value: "5",
    })
    await runThresholdChecksInternal(db, new Date())

    const shopAlerts = await ourShopAlerts()
    expect(shopAlerts).toHaveLength(1)
    expect(shopAlerts[0].status).toBe("open")

    // No requisition should be created for shop alerts.
    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.productColorId, FIXTURE.pc!))
    expect(reqs).toHaveLength(0)
  })
})
