/**
 * Task 14 (variant-flexibility Plan 2a):
 * `startStockTake` must populate `stockTakeLines.itemId` (NOT NULL) and
 * `stockTakeLines.variantId` (nullable) from the source store_stock /
 * shop_stock row, including the unresolved (variant_id NULL) case. The
 * itemName label must NOT carry an "(unresolved)" suffix — it's just the
 * bare `${articleNumber} — ${name}` per the ffc20ab convention.
 *
 * Pattern follows receive-unresolved.test.ts: mock auth/rbac, wrap calls
 * in runWithStartContext, read the DB to verify side effects.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { eq } from "drizzle-orm"

import { db } from "#/db"
import {
  stockTakeLines,
  stockTakes,
  transactionCategories,
  user,
  auditLogs,
} from "#/db/schema"
import { startStockTake } from "#/server/functions/shop/stock-take"
import {
  assertDefined,
  seedItem,
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
  { name: "Inventory - Shop", type: "asset" as const },
  { name: "Inventory - Store", type: "asset" as const },
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
      name: "Test Admin Stock-Take Unresolved",
      email: `test-admin-${TEST_USER_ID}@example.com`,
      emailVerified: true,
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(stockTakes).where(eq(stockTakes.conductedBy, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe("startStockTake — unresolved shop_stock rows", () => {
  it("records an unresolved shop_stock row with itemId set and variantId null", async () => {
    const articleNumber = `ST-UNR-${Date.now()}`
    const itemId = await seedItem({
      articleNumber,
      name: "Polo Aggregate",
    })
    const shopId = await seedShop({ name: `Test Shop ST-UNR ${Date.now()}` })
    await seedUnresolvedShopStock({
      shopId,
      itemId,
      quantity: 8,
      costPerUnitUgx: "1500.00",
    })

    await callServerFn(() =>
      startStockTake({
        data: { locationType: "shop", locationId: shopId },
      }),
    )

    // Look up the freshly-created stock take by location — the server fn's
    // return shape is wrapped by createServerFn and not stable for tests.
    const st = await db.query.stockTakes.findFirst({
      where: eq(stockTakes.locationId, shopId),
    })
    assertDefined(st, "stockTake not created")

    const lines = await db.query.stockTakeLines.findMany({
      where: eq(stockTakeLines.stockTakeId, st.id),
    })
    expect(lines).toHaveLength(1)
    const line = lines[0]
    assertDefined(line, "line missing")
    expect(line.itemId).toBe(itemId)
    expect(line.variantId).toBeNull()
    expect(line.systemQuantity).toBe(8)
    expect(line.itemName).toContain(articleNumber)
    expect(line.itemName).toContain("Polo Aggregate")
    expect(line.itemName).not.toMatch(/unresolved/i)
  })
})
