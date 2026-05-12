import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"

// TanStack Start's server-fn machinery (createServerFn / requireSession via
// getRequestHeaders) needs a request context that is unavailable in Vitest.
// Stub the auth middleware to return a fake admin session so we can exercise
// the handler logic end-to-end against the test DB.
const TEST_USER_ID = "00000000-0000-0000-0000-0000000000ab"
vi.mock("#/server/middleware/auth", () => ({
  requireSession: async () => ({
    user: { id: TEST_USER_ID, role: "admin" },
  }),
}))
vi.mock("#/server/middleware/rbac", () => ({
  requireRole: () => {},
  hasRole: () => true,
}))

import { db } from "#/db"
import {
  products,
  productColors,
  stores,
  storeStock,
  transactions,
  transactionCategories,
  auditLogs,
  user,
} from "#/db/schema"
import { addStoreOpeningBalance } from "#/server/functions/admin/opening-balance"
import { eq } from "drizzle-orm"

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
      .insert(products)
      .values({
        articleNumber: `OB-${Date.now()}`,
        name: "Test",
        sizes: ["S", "M"],
      })
      .returning()
    const [c] = await db
      .insert(productColors)
      .values({ productId: p.id, colorName: "Red", colorHex: "#cc2828" })
      .returning()
    await db.insert(stores).values({ name: "Test Store" }).onConflictDoNothing()

    await addStoreOpeningBalance({
      data: {
        items: [
          {
            productId: p.id,
            unitCostUgx: "10000",
            cells: [
              { productColorId: c.id, size: "S", quantity: 5 },
              { productColorId: c.id, size: "M", quantity: 3 },
            ],
          },
        ],
      },
    })

    // Note: TanStack server-fn middleware swallows handler return values when
    // run outside SSR, so we assert via persisted rows. itemCount === 2 is
    // implied by the 2-row insert below.
    const rows = await db.query.storeStock.findMany({
      where: eq(storeStock.productColorId, c.id),
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.size).sort()).toEqual(["M", "S"])

    await db.delete(storeStock).where(eq(storeStock.productColorId, c.id))
    await db.delete(productColors).where(eq(productColors.id, c.id))
    await db.delete(products).where(eq(products.id, p.id))
  })
})
