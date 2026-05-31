import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"

import { db } from "#/db"
import {
  items,
  itemColors,
  stores,
  storeStock,
  transactions,
  transactionCategories,
  auditLogs,
  user,
  variants,
} from "#/db/schema"
import { addStoreOpeningBalance } from "#/server/functions/admin/opening-balance"
import { eq, inArray } from "drizzle-orm"

// TanStack Start's server-fn machinery (createServerFn / requireSession via
// getRequestHeaders) needs a request context that is unavailable in Vitest.
// Stub the auth middleware to return a fake admin session so we can exercise
// the handler logic end-to-end against the test DB.
const TEST_USER_ID = "00000000-0000-0000-0000-0000000000ab"
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

// createServerFn's middleware chain pulls startOptions from AsyncLocalStorage
// at invocation time. Provide a minimal stub so calls work outside SSR.
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
  // Seed transaction categories the opening-balance journals need.
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
  // Seed the test actor user referenced by recordedBy / actor_user_id FKs.
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: "Test Admin",
      email: `test-admin-${TEST_USER_ID}@example.com`,
      emailVerified: true,
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  // Tear down ledger + audit rows our test produced so other suites (e.g.
  // auth-emails) can purge the user table without FK violations.
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

describe("addStoreOpeningBalance — variants", () => {
  it("creates one store_stock row per variant cell", async () => {
    const [p] = await db
      .insert(items)
      .values({
        articleNumber: `OB-${Date.now()}`,
        name: "Test",
        category: "Test",
      })
      .returning()
    const [c] = await db
      .insert(itemColors)
      .values({ itemId: p.id, colorName: "Red", colorHex: "#cc2828" })
      .returning()
    // The opening-balance handler now resolves (color, size) → variant_id
    // before writing to store_stock (issue #4). Seed the two variants the
    // test exercises so the resolver hits a row.
    const variantRows = await db
      .insert(variants)
      .values([
        { itemId: p.id, colorId: c.id, size: "S" },
        { itemId: p.id, colorId: c.id, size: "M" },
      ])
      .returning()
    const variantIds = variantRows.map((v) => v.id)
    await db.insert(stores).values({ name: "Test Store" }).onConflictDoNothing()

    await callServerFn(() =>
      addStoreOpeningBalance({
        data: {
          items: [
            {
              itemId: p.id,
              unitCostUgx: "10000",
              cells: [
                { variantId: variantIds[0], quantity: 5 },
                { variantId: variantIds[1], quantity: 3 },
              ],
            },
          ],
        },
      }),
    )

    // Note: TanStack server-fn middleware swallows handler return values when
    // run outside SSR, so we assert via persisted rows. itemCount === 2 is
    // implied by the 2-row insert below.
    const rows = await db.query.storeStock.findMany({
      where: inArray(storeStock.variantId, variantIds),
      with: { variant: true },
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.variant.size).sort()).toEqual(["M", "S"])

    await db
      .delete(storeStock)
      .where(inArray(storeStock.variantId, variantIds))
    await db.delete(variants).where(inArray(variants.id, variantIds))
    await db.delete(itemColors).where(eq(itemColors.id, c.id))
    await db.delete(items).where(eq(items.id, p.id))
  })
})
