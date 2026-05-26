/**
 * Pure-function tests for shift-reports aggregation logic.
 * Hits the real database (uses .env.test) but namespaces every fixture
 * with Date.now() so tests are isolated and don't TRUNCATE shared tables.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { eq } from "drizzle-orm"
import { db } from "#/db"
import {
  shops,
  user as userTable,
  items,
  itemColors,
  itemCategories,
  shopStock,
  shopSales,
  shopSaleItems,
  shiftClosures,
} from "#/db/schema"
import {
  computeShiftAggregates,
  findPeriodStart,
} from "#/server/functions/accounting/shift-reports-internals"

let runId: string
let shopId: string
let userId: string
let stockId: string

async function seed() {
  runId = `sr-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  shopId = (
    await db
      .insert(shops)
      .values({ name: `Shop ${runId}`, location: "Kampala" })
      .returning()
  )[0].id
  userId = runId
  await db.insert(userTable).values({
    id: userId,
    name: `Clerk ${runId}`,
    email: `${runId}@test.local`,
    emailVerified: true,
    role: "sales",
  })
  const [uncat] = await db
    .select()
    .from(itemCategories)
    .where(eq(itemCategories.name, "Uncategorized"))
  const p = (
    await db
      .insert(items)
      .values({
        articleNumber: runId,
        name: `Tee ${runId}`,
        sizes: ["M"],
        itemCategoryId: uncat.id,
      })
      .returning()
  )[0]
  const pc = (
    await db
      .insert(itemColors)
      .values({ itemId: p.id, colorName: "Red", colorHex: "#dc2626" })
      .returning()
  )[0]
  stockId = (
    await db
      .insert(shopStock)
      .values({
        shopId,
        productColorId: pc.id,
        size: "M",
        quantityOnHand: 100,
        costPerUnitUgx: "10000",
        minimumSellPriceUgx: "20000",
      })
      .returning()
  )[0].id
}

async function teardown() {
  await db.delete(shopSaleItems).where(eq(shopSaleItems.shopStockId, stockId))
  await db.delete(shopSales).where(eq(shopSales.shopId, shopId))
  await db.delete(shiftClosures).where(eq(shiftClosures.shopId, shopId))
  await db.delete(shopStock).where(eq(shopStock.id, stockId))
  const seededProduct = await db.query.items.findFirst({
    where: eq(items.articleNumber, runId),
  })
  if (seededProduct) {
    await db
      .delete(itemColors)
      .where(eq(itemColors.itemId, seededProduct.id))
  }
  await db.delete(items).where(eq(items.articleNumber, runId))
  await db.delete(shops).where(eq(shops.id, shopId))
  await db.delete(userTable).where(eq(userTable.id, userId))
}

async function addSale(method: "cash" | "bank" | "credit", total: string) {
  const [sale] = await db
    .insert(shopSales)
    .values({
      shopId,
      saleDate: new Date(),
      soldBy: userId,
      paymentMethod: method,
      totalAmount: total,
    })
    .returning()
  await db.insert(shopSaleItems).values({
    shopSaleId: sale.id,
    shopStockId: stockId,
    quantity: 1,
    unitPriceUgx: total,
    minimumPriceUgx: "20000",
    totalPriceUgx: total,
  })
  return sale
}

describe("computeShiftAggregates", () => {
  beforeEach(seed)
  afterEach(teardown)

  it("sums by payment method and counts sales", async () => {
    await addSale("cash", "30000")
    await addSale("bank", "20000")
    await addSale("cash", "15000")
    const agg = await computeShiftAggregates(shopId, new Date(0), new Date(Date.now() + 60_000))
    expect(agg.salesCount).toBe(3)
    expect(agg.grossSalesUgx).toBe("65000.00")
    expect(agg.cashSalesUgx).toBe("45000.00")
    expect(agg.bankSalesUgx).toBe("20000.00")
    expect(agg.creditSalesUgx).toBe("0.00")
  })

  it("returns zero totals when no sales in window", async () => {
    const agg = await computeShiftAggregates(shopId, new Date(0), new Date())
    expect(agg.salesCount).toBe(0)
    expect(agg.grossSalesUgx).toBe("0.00")
  })

  it("excludes sales outside the time window", async () => {
    await addSale("cash", "30000")
    // window is in the future — should match nothing
    const future = new Date(Date.now() + 60_000)
    const agg = await computeShiftAggregates(shopId, future, new Date(future.getTime() + 60_000))
    expect(agg.salesCount).toBe(0)
  })
})

describe("findPeriodStart", () => {
  beforeEach(seed)
  afterEach(teardown)

  it("returns epoch for first Z", async () => {
    const start = await findPeriodStart(shopId)
    expect(start.periodStart.getTime()).toBe(0)
    expect(start.previousClosureNumber).toBe(0)
  })

  it("returns the previous Z's closedAt", async () => {
    const closedAt = new Date("2026-05-01T10:00:00Z")
    await db.insert(shiftClosures).values({
      shopId,
      closureNumber: 1,
      periodStart: new Date(0),
      closedAt,
      closedBy: userId,
      declaredCashUgx: "0",
      expectedCashUgx: "0",
      varianceUgx: "0",
      grossSalesUgx: "0",
      cashSalesUgx: "0",
      bankSalesUgx: "0",
      creditSalesUgx: "0",
      salesCount: 0,
    })
    const start = await findPeriodStart(shopId)
    expect(start.periodStart.toISOString()).toBe(closedAt.toISOString())
    expect(start.previousClosureNumber).toBe(1)
  })
})
