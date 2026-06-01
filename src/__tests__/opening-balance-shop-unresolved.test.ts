import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { and, eq, isNull, inArray } from "drizzle-orm"

import { db } from "#/db"
import {
  items,
  itemColors,
  shops,
  shopStock,
  transactions,
  transactionCategories,
  auditLogs,
  user,
  variants,
} from "#/db/schema"
import { addShopOpeningBalance } from "#/server/functions/admin/opening-balance"

// Mirror the auth-stub pattern used by opening-balance-variants.test.ts.
const TEST_USER_ID = "00000000-0000-0000-0000-0000000000ac"
vi.mock("#/server/middleware/auth", () => ({
  requireSession: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: "admin" },
    }),
}))
vi.mock("#/server/middleware/rbac", () => ({
  requireRole: () => {},
  hasRole: () => true,
}))

const stubStartContext = {
  getRouter: (() => {
    throw new Error("router not available in tests")
  }) as never,
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
  { name: "Inventory - Store", type: "asset" as const },
  { name: "Inventory - Shop", type: "asset" as const },
  { name: "Owner's Equity", type: "equity" as const },
]

beforeAll(async () => {
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: "Test Admin Shop OB",
      email: `test-admin-${TEST_USER_ID}@example.com`,
      emailVerified: true,
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe("addShopOpeningBalance — variant-flexible rows", () => {
  it("creates a variant-less shop_stock row when only item info is provided", async () => {
    const [item] = await db
      .insert(items)
      .values({
        articleNumber: `OP-UNR-${Date.now()}`,
        name: "Polo Aggregate",
        category: "Test",
      })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Test Shop UNR ${Date.now()}` })
      .returning()

    await callServerFn(() =>
      addShopOpeningBalance({
        data: {
          shopId: shop.id,
          items: [
            {
              itemId: item.id,
              unitCostUgx: "1500.00",
              cells: [{ variantId: null, quantity: 12 }],
            },
          ],
        },
      }),
    )

    const rows = await db.query.shopStock.findMany({
      where: and(
        eq(shopStock.shopId, shop.id),
        eq(shopStock.itemId, item.id),
        isNull(shopStock.variantId),
      ),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityOnHand).toBe(12)
    expect(rows[0].variantId).toBeNull()

    // Cleanup
    await db.delete(shopStock).where(eq(shopStock.shopId, shop.id))
    await db.delete(shops).where(eq(shops.id, shop.id))
    await db.delete(items).where(eq(items.id, item.id))
  })

  it("creates a variant-keyed row when variantId is provided", async () => {
    const [item] = await db
      .insert(items)
      .values({
        articleNumber: `OP-RES-${Date.now()}`,
        name: "Polo Resolved",
        category: "Test",
      })
      .returning()
    const [color] = await db
      .insert(itemColors)
      .values({ itemId: item.id, colorName: "Burgundy", colorHex: "#800020" })
      .returning()
    const [variant] = await db
      .insert(variants)
      .values({ itemId: item.id, colorId: color.id, size: "M" })
      .returning()
    const [shop] = await db
      .insert(shops)
      .values({ name: `Test Shop RES ${Date.now()}` })
      .returning()

    await callServerFn(() =>
      addShopOpeningBalance({
        data: {
          shopId: shop.id,
          items: [
            {
              itemId: item.id,
              unitCostUgx: "1500.00",
              cells: [{ variantId: variant.id, quantity: 8 }],
            },
          ],
        },
      }),
    )

    const rows = await db.query.shopStock.findMany({
      where: and(
        eq(shopStock.shopId, shop.id),
        eq(shopStock.itemId, item.id),
      ),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].variantId).toBe(variant.id)
    expect(rows[0].quantityOnHand).toBe(8)

    // Cleanup
    await db.delete(shopStock).where(eq(shopStock.shopId, shop.id))
    await db.delete(shops).where(eq(shops.id, shop.id))
    await db.delete(variants).where(inArray(variants.id, [variant.id]))
    await db.delete(itemColors).where(eq(itemColors.id, color.id))
    await db.delete(items).where(eq(items.id, item.id))
  })
})
