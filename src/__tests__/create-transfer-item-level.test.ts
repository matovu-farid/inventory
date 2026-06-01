/**
 * Plan 2a Task 7 — `createTransfer` accepts item-level dispatch input
 * (`{ itemId, variantId?, quantityDispatched }`) and uses
 * `pickStoreStockFifo` to plan a per-source allocation across
 * `store_stock` rows.
 *
 * Three scenarios:
 *   1. Unresolved item spread across multiple source lots — oldest
 *      supply line drains first.
 *   2. Total on-hand < requested → clear shortfall error.
 *   3. variantId-scoped dispatch only draws from that variant's lots.
 *
 * Pattern follows receive-unresolved.test.ts / specify-stock.test.ts:
 * mock auth/rbac, wrap calls in `runWithStartContext`, read the DB to
 * verify side effects.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { and, eq } from "drizzle-orm"

import { db } from "#/db"
import {
  storeTransfers,
  storeTransferLines,
  storeTransferAllocations,
  storeStock,
  transactionCategories,
  transactions,
  auditLogs,
  user,
} from "#/db/schema"
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedStore,
  seedShop,
  seedSupplyRouteLine,
  seedStoreStockLot,
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
const { createTransfer } = await import("#/server/functions/store/transfers")

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

// Ledger categories the inventory + inter-branch journals reference.
const REQUIRED_CATEGORIES = [
  { name: "Inventory - Store", type: "asset" as const },
  { name: "Inventory - Shop", type: "asset" as const },
  { name: "Store Transfer Revenue", type: "revenue" as const },
  { name: "Store Transfer Loss", type: "expense" as const },
  { name: "Due from Shop", type: "asset" as const },
  { name: "Due to Store", type: "liability" as const },
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
      name: "Test Admin",
      email: `test-tx7-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing()
})

afterAll(async () => {
  // resetTestDb (called in beforeEach) already nukes business rows, but
  // a final pass keeps subsequent suites (e.g. auth-emails) from FK
  // collisions when they purge the user table.
  await resetTestDb()
  await db.delete(transactions).where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

beforeEach(async () => {
  // resetTestDb truncates every business table with CASCADE, but leaves
  // transaction_categories + the test user (recreated in beforeAll once)
  // alone via the cleanup ordering.
  await resetTestDb()
  // resetTestDb wipes "user" too, so re-seed the actor.
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: "Test Admin",
      email: `test-tx7-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing()
  // resetTestDb also wipes transaction_categories — re-seed.
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
})

describe("createTransfer — item-level FIFO", () => {
  it("dispatches an unresolved item across multiple source lots oldest-first", async () => {
    const itemId = await seedItem({
      articleNumber: "TX-1",
      name: "Polo",
      // Non-zero floor so the transfer-value ledger leg is non-zero
      // (postJournalEntry refuses zero-amount journals).
      minimumSellPriceUgx: "200.00",
    })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const olderLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-01-01",
    })
    const newerLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-02-01",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: olderLine, quantity: 4, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: newerLine, quantity: 6, costPerUnitUgx: "120.00",
    })

    await callServerFn(() =>
      createTransfer({
        data: {
          shopId,
          items: [{ itemId, quantityDispatched: 7 }],
        },
      }),
    )

    // runWithStartContext swallows handler return values, so we read
    // the persisted transfer directly. There is exactly one for this
    // shop in the freshly-reset DB.
    const transfer = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.shopId, shopId),
    })
    if (!transfer) throw new Error("Transfer not persisted")

    // One transfer line was created — item-level (storeStockId NULL).
    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    expect(lines).toHaveLength(1)
    const line = lines[0]
    expect(line.itemId).toBe(itemId)
    expect(line.variantId).toBeNull()
    expect(line.storeStockId).toBeNull()
    expect(line.quantityDispatched).toBe(7)

    // Two allocations: 4 from older lot, 3 from newer lot.
    const allocs = await db.query.storeTransferAllocations.findMany({
      where: eq(storeTransferAllocations.storeTransferLineId, line.id),
    })
    expect(allocs).toHaveLength(2)
    const qs = allocs.map((a) => a.quantity).sort((x, y) => x - y)
    expect(qs).toEqual([3, 4])

    // Source store_stock decremented from 10 → 3.
    const lots = await db.query.storeStock.findMany({
      where: and(eq(storeStock.storeId, storeId), eq(storeStock.itemId, itemId)),
    })
    const total = lots.reduce((s, l) => s + l.quantityOnHand, 0)
    expect(total).toBe(3)
  })

  it("throws with a clear message when total on-hand < requested", async () => {
    const itemId = await seedItem({
      articleNumber: "TX-2",
      name: "Polo",
      minimumSellPriceUgx: "200.00",
    })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: lineId, quantity: 2, costPerUnitUgx: "100.00",
    })

    await expect(
      callServerFn(() =>
        createTransfer({
          data: { shopId, items: [{ itemId, quantityDispatched: 5 }] },
        }),
      ),
    ).rejects.toThrow(/insufficient/i)
  })

  it("variantId-scoped dispatch only draws from that variant's lots", async () => {
    const itemId = await seedItem({
      articleNumber: "TX-3",
      name: "Polo",
      minimumSellPriceUgx: "200.00",
    })
    const colorId = await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const vLine = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const uLine = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    const { variantId } = await seedStoreStockLot({
      storeId, itemId, colorId, size: "M",
      supplyRouteLineId: vLine, quantity: 5, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: uLine, quantity: 10, costPerUnitUgx: "120.00",
    })

    if (!variantId) throw new Error("seedStoreStockLot returned null variantId")

    await callServerFn(() =>
      createTransfer({
        data: {
          shopId,
          items: [{ itemId, variantId, quantityDispatched: 3 }],
        },
      }),
    )

    const transfer = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.shopId, shopId),
    })
    if (!transfer) throw new Error("Transfer not persisted")

    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].variantId).toBe(variantId)
    const allocs = await db.query.storeTransferAllocations.findMany({
      where: eq(storeTransferAllocations.storeTransferLineId, lines[0].id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].quantity).toBe(3)
    // The unresolved lot is untouched (10 remaining).
    const unresolvedLots = await db.query.storeStock.findMany({
      where: and(eq(storeStock.storeId, storeId), eq(storeStock.itemId, itemId)),
    })
    const unresolvedTotal = unresolvedLots
      .filter((l) => l.variantId === null)
      .reduce((s, l) => s + l.quantityOnHand, 0)
    expect(unresolvedTotal).toBe(10)
  })
})
