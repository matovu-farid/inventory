/**
 * Plan 2b Task 7 — `getSaleReceiptHtml` renders unresolved sale lines
 * without throwing. Variant-scoped lines keep their full `· color / size`
 * label; item-level lines fall back to `article name`.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { eq } from "drizzle-orm"

import { db } from "#/db"
import {
  shopSales,
  transactionCategories,
  transactions,
  auditLogs,
  user,
} from "#/db/schema"
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedShop,
  seedSupplyRouteLine,
  seedShopStockLot,
} from "./test-helpers"

const TEST_USER_ID = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, "0")}`
const session = {
  user: { id: TEST_USER_ID, role: "admin" as "admin" | "supervisor" | "sales" },
}

vi.mock("#/server/middleware/auth", () => ({
  requireSession: () => Promise.resolve(session),
}))
vi.mock("#/server/middleware/rbac", () => ({
  requireRole: (sess: { user: { role: string } }, roles: string[]) => {
    if (!roles.includes(sess.user.role)) {
      throw new Error(`Forbidden`)
    }
  },
  hasRole: () => true,
}))

const { recordSale } = await import("#/server/functions/shop/sales")
const { buildSaleReceiptHtml } = await import("#/server/functions/shop/receipt-render.server")

const stubStartContext = {
  getRouter: (() => { throw new Error("router not available") }) as never,
  request: new Request("http://localhost/test"),
  startOptions: { functionMiddleware: [] },
  contextAfterGlobalMiddlewares: {},
  executedRequestMiddlewares: new Set(),
  handlerType: "serverFn" as const,
}
function callServerFn<T>(fn: () => Promise<T>): Promise<T> {
  return runWithStartContext(stubStartContext, fn)
}

const REQUIRED_CATEGORIES = [
  { name: "Cash", type: "asset" as const },
  { name: "Sales Revenue", type: "revenue" as const },
  { name: "Cost of Goods Sold", type: "expense" as const },
  { name: "Inventory - Shop", type: "asset" as const },
]

async function reseedUser() {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: "Test Admin",
    email: `test-rcpt-${TEST_USER_ID}@example.com`,
    emailVerified: true,
    role: "admin",
  }).onConflictDoNothing()
}

async function reseedCategories() {
  for (const cat of REQUIRED_CATEGORIES) {
    await db.insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
}

beforeAll(async () => { await reseedCategories(); await reseedUser() })
afterAll(async () => {
  await resetTestDb()
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})
beforeEach(async () => {
  await resetTestDb()
  await reseedUser()
  await reseedCategories()
})

describe("getSaleReceiptHtml — item-level rendering", () => {
  it("renders unresolved line with item-level label (no variant suffix)", async () => {
    const itemId = await seedItem({
      articleNumber: "RCP-1", name: "Polo", minimumSellPriceUgx: "100.00",
    })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    await seedShopStockLot({
      shopId, itemId, variantId: null,
      supplyRouteLineId: lineId, quantity: 5, costPerUnitUgx: "60.00",
    })

    await callServerFn(() =>
      recordSale({
        data: {
          shopId, paymentMethod: "cash",
          items: [{ itemId, quantity: 2, unitPriceUgx: "150.00" }],
        },
      }),
    )

    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error("Sale not found")

    const html = await buildSaleReceiptHtml(sale.id)
    expect(html).toContain("RCP-1 Polo")
    expect(html).not.toContain("·") // unresolved → no color/size separator
  })

  it("renders variant line with full `article name · color / size` label", async () => {
    const itemId = await seedItem({
      articleNumber: "RCP-2", name: "Tee", minimumSellPriceUgx: "100.00",
    })
    const colorId = await seedColor({ itemId, colorName: "Burgundy", colorHex: "#a00" })
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const { variantId } = await seedShopStockLot({
      shopId, itemId, colorId, size: "M",
      supplyRouteLineId: lineId, quantity: 5, costPerUnitUgx: "60.00",
    })
    if (!variantId) throw new Error("variant seed failed")

    await callServerFn(() =>
      recordSale({
        data: {
          shopId, paymentMethod: "cash",
          items: [{ itemId, variantId, quantity: 1, unitPriceUgx: "150.00" }],
        },
      }),
    )

    const sale = await db.query.shopSales.findFirst({
      where: eq(shopSales.shopId, shopId),
    })
    if (!sale) throw new Error("Sale not found")

    const html = await buildSaleReceiptHtml(sale.id)
    expect(html).toContain("RCP-2 Tee")
    expect(html).toContain("Burgundy / M")
  })
})
