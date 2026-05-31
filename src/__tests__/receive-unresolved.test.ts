/**
 * Task 7 (variant-flexibility Plan 1):
 * `receiveGoods` accepts supply lines that don't yet have a fully-resolved
 * (color, size) variant. Aggregate / color-only lines land as
 * `store_stock` rows with `variant_id` NULL — to be specified later.
 *
 * Pattern follows receiving-backdate.test.ts: mock auth/rbac, wrap calls
 * in runWithStartContext, read the DB to verify side effects.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "#/db"
import {
  items,
  itemColors,
  stores,
  storeReceivings,
  storeStock,
  suppliers,
  supplyRoutes,
  supplyRouteLines,
  transactions,
  transactionCategories,
  auditLogs,
  user,
  variants,
} from "#/db/schema"
import { receiveGoods } from "#/server/functions/store/receiving"

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
  { name: "Inventory - Store", type: "asset" as const },
  { name: "Cash", type: "asset" as const },
  { name: "Inventory Loss", type: "expense" as const },
]

const SUFFIX = `ur-${Date.now()}`

// Aggregate / unresolved scenario
let supplierId: string
let aggRouteId: string
let aggItemId: string
let aggLineId: string

// Resolved happy-path scenario
let resRouteId: string
let resItemId: string
let resLineId: string
let resColorId: string

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
      name: "Test Admin",
      email: `test-ur-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing()

  // Ensure at least one store exists; receive handler picks the first.
  const existingStore = await db.query.stores.findFirst()
  if (!existingStore) {
    await db.insert(stores).values({ name: `Test Store ${SUFFIX}` })
  }

  const [sup] = await db
    .insert(suppliers)
    .values({ name: `Supplier ${SUFFIX}`, type: "international" })
    .returning()
  supplierId = sup.id

  // --- Aggregate (unresolved) seed ---
  const [aggItem] = await db
    .insert(items)
    .values({
      articleNumber: `AGG-A-${SUFFIX}`,
      name: "Unresolved Polo",
      category: "Test",
    })
    .returning()
  aggItemId = aggItem.id

  const [aggRoute] = await db
    .insert(supplyRoutes)
    .values({
      name: `Route Agg ${SUFFIX}`,
      status: "in_transit",
      departureDate: "2026-04-01",
    })
    .returning()
  aggRouteId = aggRoute.id

  const [aggLine] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId: aggRouteId,
      supplierId,
      itemId: aggItemId,
      // colorId NULL, size NULL — aggregate procurement row
      quantity: 9,
      unitPriceForeign: "49.00",
      foreignCurrency: "RMB",
      totalAmountForeign: "441.00",
      totalCostUgx: "90000.00",
    })
    .returning()
  aggLineId = aggLine.id

  // --- Resolved (happy-path) seed ---
  const [resItem] = await db
    .insert(items)
    .values({
      articleNumber: `RES-A-${SUFFIX}`,
      name: "Resolved Polo",
      category: "Test",
    })
    .returning()
  resItemId = resItem.id

  const [resColor] = await db
    .insert(itemColors)
    .values({ itemId: resItemId, colorName: "Red", colorHex: "#cf1a1a" })
    .returning()
  resColorId = resColor.id

  await db
    .insert(variants)
    .values({ itemId: resItemId, colorId: resColorId, size: "L" })
    .onConflictDoNothing()

  const [resRoute] = await db
    .insert(supplyRoutes)
    .values({
      name: `Route Res ${SUFFIX}`,
      status: "in_transit",
      departureDate: "2026-04-01",
    })
    .returning()
  resRouteId = resRoute.id

  const [resLine] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId: resRouteId,
      supplierId,
      itemId: resItemId,
      colorId: resColorId,
      size: "L",
      quantity: 5,
      unitPriceForeign: "30.00",
      foreignCurrency: "RMB",
      totalAmountForeign: "150.00",
      totalCostUgx: "60000.00",
    })
    .returning()
  resLineId = resLine.id
})

afterAll(async () => {
  // Tear down FK-safe order.
  await db.delete(storeReceivings).where(eq(storeReceivings.supplyRouteLineId, aggLineId))
  await db.delete(storeReceivings).where(eq(storeReceivings.supplyRouteLineId, resLineId))

  await db.delete(storeStock).where(eq(storeStock.itemId, aggItemId))
  await db.delete(storeStock).where(eq(storeStock.itemId, resItemId))

  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))

  await db.delete(supplyRouteLines).where(eq(supplyRouteLines.id, aggLineId))
  await db.delete(supplyRouteLines).where(eq(supplyRouteLines.id, resLineId))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.id, aggRouteId))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.id, resRouteId))

  await db.delete(variants).where(eq(variants.itemId, resItemId))
  await db.delete(itemColors).where(eq(itemColors.id, resColorId))
  await db.delete(items).where(eq(items.id, aggItemId))
  await db.delete(items).where(eq(items.id, resItemId))
  await db.delete(suppliers).where(eq(suppliers.id, supplierId))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe("receiveGoods — unresolved lines", () => {
  it("creates a store_stock row with variant_id NULL and itemId set", async () => {
    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId: aggRouteId,
          items: [{ supplyRouteLineId: aggLineId, quantityReceived: 9 }],
        },
      }),
    )

    const rows = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.itemId, aggItemId),
        isNull(storeStock.variantId),
      ),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityOnHand).toBe(9)
    expect(rows[0].supplyRouteLineId).toBe(aggLineId)
  })

  it("creates a variant-keyed store_stock row when color and size present", async () => {
    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId: resRouteId,
          items: [{ supplyRouteLineId: resLineId, quantityReceived: 5 }],
        },
      }),
    )

    const rows = await db.query.storeStock.findMany({
      where: eq(storeStock.itemId, resItemId),
    })
    expect(rows).toHaveLength(1)
    const variantId = rows[0].variantId
    if (variantId === null) {
      throw new Error("expected variantId to be non-null")
    }
    expect(rows[0].quantityOnHand).toBe(5)
    expect(rows[0].supplyRouteLineId).toBe(resLineId)

    // Verify the variant we resolved against matches our seed.
    const v = await db.query.variants.findFirst({
      where: eq(variants.id, variantId),
    })
    expect(v?.colorId).toBe(resColorId)
    expect(v?.size).toBe("L")
  })
})
