/**
 * Plan 2a Task 11 — `specifyShopStock` mirrors Plan 1's `specifyStock`
 * but operates on `shop_stock` instead of `store_stock`. Use case: a
 * transfer arrives at a shop unresolved (item-level dispatch from the
 * store) and the cashier wants to label the lots into variants before
 * selling.
 *
 * Pattern mirrors specify-stock.test.ts: mock auth/rbac, wrap calls in
 * `runWithStartContext`, read the DB to verify side effects.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { and, eq } from "drizzle-orm"

import { db } from "#/db"
import { shopStock, auditLogs, user, variants } from "#/db/schema"
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedShop,
  seedUnresolvedShopStock,
} from "./test-helpers"

const TEST_USER_ID = `00000000-0000-0000-0000-${Date.now().toString().slice(-12).padStart(12, "0")}`
const session = {
  user: { id: TEST_USER_ID, role: "admin" as "admin" | "supervisor" },
}

vi.mock("#/server/middleware/auth", () => ({
  requireSession: () => Promise.resolve(session),
}))
vi.mock("#/server/middleware/rbac", () => ({
  requireRole: (sess: { user: { role: string } }, roles: string[]) => {
    if (!roles.includes(sess.user.role)) {
      throw new Error(`Forbidden: role ${sess.user.role} not in ${roles.join(",")}`)
    }
  },
  hasRole: (sess: { user: { role: string } }, roles: string[]) =>
    roles.includes(sess.user.role),
}))

// Import after vi.mock so the mocks bind to the handler under test.
const { specifyShopStock } = await import("#/server/functions/shop/specify")

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

beforeAll(async () => {
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: "Specify-Shop Test Admin",
      email: `specify-shop-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await resetTestDb()
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

beforeEach(async () => {
  await resetTestDb()
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: "Specify-Shop Test Admin",
      email: `specify-shop-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing()
})

describe("specifyShopStock", () => {
  it("splits an unresolved shop_stock row into N variant-keyed rows when fully specified", async () => {
    const itemId = await seedItem({ articleNumber: "SS-01", name: "Shop Tee 01" })
    const burgundyId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const forestId = await seedColor({
      itemId,
      colorName: "Forest",
      colorHex: "#1F3D26",
    })
    const shopId = await seedShop()
    const { stockId, supplyRouteLineId } = await seedUnresolvedShopStock({
      shopId,
      itemId,
      quantity: 9,
      costPerUnitUgx: "100.00",
    })

    await callServerFn(() =>
      specifyShopStock({
        data: {
          shopStockId: stockId,
          lines: [
            { colorId: burgundyId, size: "M", quantity: 5 },
            { colorId: forestId, size: "L", quantity: 4 },
          ],
        },
      }),
    )

    // Original row gone.
    const orig = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, stockId),
    })
    expect(orig).toBeUndefined()

    // Two new variant-keyed rows for the same (shop, item, supply line)
    // pair, quantities 5 + 4, inheriting the source cost + supply line.
    const newRows = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(newRows).toHaveLength(2)
    expect(newRows.map((r) => r.quantityOnHand).sort()).toEqual([4, 5])
    for (const r of newRows) {
      expect(r.costPerUnitUgx).toBe("100.00")
      expect(r.variantId).not.toBeNull()
      expect(r.supplyRouteLineId).toBe(supplyRouteLineId)
    }
  })

  it("leaves a leftover unresolved row when specified < total", async () => {
    const itemId = await seedItem({ articleNumber: "SS-02", name: "Shop Tee 02" })
    const burgundyId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const shopId = await seedShop()
    const { stockId } = await seedUnresolvedShopStock({
      shopId,
      itemId,
      quantity: 9,
      costPerUnitUgx: "100.00",
    })

    await callServerFn(() =>
      specifyShopStock({
        data: {
          shopStockId: stockId,
          lines: [{ colorId: burgundyId, size: "M", quantity: 5 }],
        },
      }),
    )

    const orig = await db.query.shopStock.findFirst({
      where: eq(shopStock.id, stockId),
    })
    expect(orig?.quantityOnHand).toBe(4)
    expect(orig?.variantId).toBeNull()
  })

  it("creates the variant row if it doesn't exist yet", async () => {
    const itemId = await seedItem({ articleNumber: "SS-03", name: "Shop Tee 03" })
    const colorId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const shopId = await seedShop()
    const { stockId } = await seedUnresolvedShopStock({
      shopId,
      itemId,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })

    await callServerFn(() =>
      specifyShopStock({
        data: {
          shopStockId: stockId,
          lines: [{ colorId, size: "XS", quantity: 5 }],
        },
      }),
    )

    const v = await db.query.variants.findFirst({
      where: and(eq(variants.colorId, colorId), eq(variants.size, "XS")),
    })
    expect(v).toBeDefined()
  })

  it("rejects when sum(lines) > available qty", async () => {
    const itemId = await seedItem({ articleNumber: "SS-04", name: "Shop Tee 04" })
    const colorId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const shopId = await seedShop()
    const { stockId } = await seedUnresolvedShopStock({
      shopId,
      itemId,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })

    await expect(
      callServerFn(() =>
        specifyShopStock({
          data: {
            shopStockId: stockId,
            lines: [{ colorId, size: "M", quantity: 6 }],
          },
        }),
      ),
    ).rejects.toThrow(/exceeds available/i)
  })

  it("rejects when colorId does not belong to the item", async () => {
    const itemA = await seedItem({ articleNumber: "SS-05A", name: "Shop Tee 05A" })
    const itemB = await seedItem({ articleNumber: "SS-05B", name: "Shop Tee 05B" })
    // Color belongs to itemB.
    const wrongColorId = await seedColor({
      itemId: itemB,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })
    const shopId = await seedShop()
    const { stockId } = await seedUnresolvedShopStock({
      shopId,
      itemId: itemA,
      quantity: 5,
      costPerUnitUgx: "100.00",
    })

    await expect(
      callServerFn(() =>
        specifyShopStock({
          data: {
            shopStockId: stockId,
            lines: [{ colorId: wrongColorId, size: "M", quantity: 1 }],
          },
        }),
      ),
    ).rejects.toThrow(/does not belong/i)
  })
})
