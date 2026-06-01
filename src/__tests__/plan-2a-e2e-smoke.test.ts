/**
 * Plan 2a Task 15 — End-to-end smoke covering the full chain that the
 * 14 preceding tasks built up. Individual pieces have unit-style tests;
 * this one exercises the whole pipeline in one transaction-ordered
 * narrative so we can catch cross-task contract breakage (cost
 * provenance lost between hops, denorms missing on stock-take, etc.)
 * that a single-feature test would miss.
 *
 * Two scenarios:
 *   A. Unresolved end-to-end — receive aggregate supply line into the
 *      store, transfer item-level to a shop (no variant), confirm
 *      receipt, specify some at the shop (leaving leftover), then start
 *      a stock take and assert the denorm fields (item_id, variant_id,
 *      itemName) are populated correctly on every line.
 *   B. Variant-scoped chain — receive aggregate at the store, specify
 *      into a concrete (color, size), transfer variant-scoped to a
 *      shop, confirm receipt, assert one variant-keyed shop_stock row
 *      with cost provenance preserved end-to-end.
 *
 * Pattern matches confirm-transfer-receipt.test.ts (mock auth/rbac,
 * wrap in runWithStartContext, read the DB to verify side effects).
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest"
import { runWithStartContext } from "@tanstack/start-storage-context"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "#/db"
import {
  shopStock,
  storeStock,
  storeTransfers,
  storeTransferLines,
  storeTransferAllocations,
  supplyRouteLines,
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
  seedSupplier,
  seedSupplyRoute,
  assertDefined,
} from "./test-helpers"

const TEST_USER_ID = `00000000-0000-0000-0000-${Date.now()
  .toString()
  .slice(-12)
  .padStart(12, "0")}`
const session = {
  user: { id: TEST_USER_ID, role: "admin" as "admin" | "supervisor" },
}

vi.mock("#/server/middleware/auth", () => ({
  requireSession: () => Promise.resolve(session),
}))
vi.mock("#/server/middleware/rbac", () => ({
  requireRole: (sess: { user: { role: string } }, roles: string[]) => {
    if (!roles.includes(sess.user.role)) {
      throw new Error(
        `Forbidden: role ${sess.user.role} not in ${roles.join(",")}`,
      )
    }
  },
  hasRole: (sess: { user: { role: string } }, roles: string[]) =>
    roles.includes(sess.user.role),
}))

// Import after vi.mock so the mocks bind to the handlers under test.
const { receiveGoods } = await import("#/server/functions/store/receiving")
const { createTransfer, confirmTransferReceipt } = await import(
  "#/server/functions/store/transfers"
)
const { specifyStock } = await import("#/server/functions/store/specify")
const { specifyShopStock } = await import("#/server/functions/shop/specify")
const { startStockTake } = await import("#/server/functions/shop/stock-take")

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

// All the ledger categories the chain touches: receiveGoods + transfer
// dispatch + transfer receipt + (optional) loss postings.
const REQUIRED_CATEGORIES = [
  { name: "Inventory - Store", type: "asset" as const },
  { name: "Inventory - Shop", type: "asset" as const },
  { name: "Cash", type: "asset" as const },
  { name: "Store Transfer Revenue", type: "revenue" as const },
  { name: "Store Transfer Loss", type: "expense" as const },
  { name: "Inventory Loss", type: "expense" as const },
  { name: "Due from Shop", type: "asset" as const },
  { name: "Due to Store", type: "liability" as const },
]

async function seedTestUser(): Promise<void> {
  await db
    .insert(user)
    .values({
      id: TEST_USER_ID,
      name: "Test Admin",
      email: `test-e2e-${TEST_USER_ID}@example.com`,
      emailVerified: true,
      role: "admin",
    })
    .onConflictDoNothing()
}

async function seedCategories(): Promise<void> {
  for (const cat of REQUIRED_CATEGORIES) {
    await db
      .insert(transactionCategories)
      .values({ name: cat.name, type: cat.type, isDefault: true })
      .onConflictDoNothing()
  }
}

/**
 * Insert an aggregate supply route line directly (colorId + size NULL).
 * `seedSupplyRouteLine` accepts these nullable args, but the inline
 * insert keeps cost provenance values explicit for the smoke
 * narrative.
 */
async function insertAggregateSupplyLine(input: {
  supplyRouteId: string
  supplierId: string
  itemId: string
  quantity: number
  totalCostUgx: string
}): Promise<string> {
  const [row] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId: input.supplyRouteId,
      supplierId: input.supplierId,
      itemId: input.itemId,
      colorId: null,
      size: null,
      quantity: input.quantity,
      unitPriceForeign: "1.00",
      foreignCurrency: "RMB",
      totalAmountForeign: input.quantity.toFixed(2),
      totalCostUgx: input.totalCostUgx,
    })
    .returning()
  assertDefined(row, "insertAggregateSupplyLine: no row returned")
  return row.id
}

beforeAll(async () => {
  await seedCategories()
  await seedTestUser()
})

afterAll(async () => {
  await resetTestDb()
  await db
    .delete(transactions)
    .where(eq(transactions.recordedBy, TEST_USER_ID))
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, TEST_USER_ID))
  await db.delete(user).where(eq(user.id, TEST_USER_ID))
})

beforeEach(async () => {
  await resetTestDb()
  await seedCategories()
  await seedTestUser()
})

describe("Plan 2a E2E — unresolved chain", () => {
  it("receives unresolved → transfers item-level → confirms at shop → specifies → stock-take captures denorms", async () => {
    // ---- 1. Catalog seed ----
    const itemId = await seedItem({
      articleNumber: "E2E-1",
      name: "Polo",
      minimumSellPriceUgx: "200.00",
    })
    const burgundyId = await seedColor({
      itemId,
      colorName: "Burgundy",
      colorHex: "#722F37",
    })

    // Receive handler picks the first store, so we need one.
    await seedStore({ name: "E2E Store" })

    const supplierId = await seedSupplier()
    const supplyRouteId = await seedSupplyRoute()
    // Aggregate line — 10 units at 100 UGX/unit cost.
    const supplyLineId = await insertAggregateSupplyLine({
      supplyRouteId,
      supplierId,
      itemId,
      quantity: 10,
      totalCostUgx: "1000.00",
    })

    // ---- 2. Receive 10 unresolved into the store ----
    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId,
          items: [{ supplyRouteLineId: supplyLineId, quantityReceived: 10 }],
        },
      }),
    )

    const storeAfterReceive = await db.query.storeStock.findMany({
      where: and(
        eq(storeStock.itemId, itemId),
        isNull(storeStock.variantId),
      ),
    })
    expect(storeAfterReceive).toHaveLength(1)
    expect(storeAfterReceive[0].quantityOnHand).toBe(10)
    expect(storeAfterReceive[0].supplyRouteLineId).toBe(supplyLineId)
    const storeCostPerUnit = storeAfterReceive[0].costPerUnitUgx

    // ---- 3. Transfer 6 item-level (no variant) to a shop ----
    const shopId = await seedShop({ name: "E2E Shop" })
    await callServerFn(() =>
      createTransfer({
        data: {
          shopId,
          items: [{ itemId, quantityDispatched: 6 }],
        },
      }),
    )
    const transfer = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.shopId, shopId),
    })
    if (!transfer) throw new Error("Transfer not persisted")

    const tLines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    expect(tLines).toHaveLength(1)
    expect(tLines[0].itemId).toBe(itemId)
    expect(tLines[0].variantId).toBeNull()
    expect(tLines[0].storeStockId).toBeNull() // item-level dispatch sentinel

    const allocs = await db.query.storeTransferAllocations.findMany({
      where: eq(storeTransferAllocations.storeTransferLineId, tLines[0].id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].quantity).toBe(6)
    expect(allocs[0].supplyRouteLineId).toBe(supplyLineId)
    // Cost provenance carried into the allocation row.
    expect(allocs[0].costPerUnitUgx).toBe(storeCostPerUnit)

    // Store stock decremented by 6.
    const storeAfterDispatch = await db.query.storeStock.findFirst({
      where: eq(storeStock.id, storeAfterReceive[0].id),
    })
    expect(storeAfterDispatch?.quantityOnHand).toBe(4)

    // ---- 4. Confirm receipt at the shop (full 6) ----
    await callServerFn(() =>
      confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: [
            { transferItemId: tLines[0].id, quantityReceived: 6 },
          ],
        },
      }),
    )

    const shopAfterReceive = await db.query.shopStock.findMany({
      where: and(
        eq(shopStock.shopId, shopId),
        eq(shopStock.itemId, itemId),
        isNull(shopStock.variantId),
      ),
    })
    expect(shopAfterReceive).toHaveLength(1)
    expect(shopAfterReceive[0].quantityOnHand).toBe(6)
    // Supply line + cost survive the transfer hop.
    expect(shopAfterReceive[0].supplyRouteLineId).toBe(supplyLineId)
    expect(shopAfterReceive[0].costPerUnitUgx).toBe(allocs[0].costPerUnitUgx)
    const shopRowId = shopAfterReceive[0].id
    const shopCost = shopAfterReceive[0].costPerUnitUgx

    // ---- 5. Specify at the shop: 4 → Burgundy/M, 2 left unresolved ----
    await callServerFn(() =>
      specifyShopStock({
        data: {
          shopStockId: shopRowId,
          lines: [{ colorId: burgundyId, size: "M", quantity: 4 }],
        },
      }),
    )

    const shopAfterSpecify = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(shopAfterSpecify).toHaveLength(2)
    const variantRow = shopAfterSpecify.find((r) => r.variantId !== null)
    const leftoverRow = shopAfterSpecify.find((r) => r.variantId === null)
    expect(variantRow?.quantityOnHand).toBe(4)
    expect(leftoverRow?.quantityOnHand).toBe(2)
    // Both children inherit the supply-line and cost from the source row.
    expect(variantRow?.supplyRouteLineId).toBe(supplyLineId)
    expect(leftoverRow?.supplyRouteLineId).toBe(supplyLineId)
    expect(variantRow?.costPerUnitUgx).toBe(shopCost)
    expect(leftoverRow?.costPerUnitUgx).toBe(shopCost)

    // ---- 6. Stock-take at the shop captures both lines with denorms ----
    await callServerFn(() =>
      startStockTake({
        data: { locationType: "shop", locationId: shopId },
      }),
    )

    const stkLines = await db.query.stockTakeLines.findMany()
    expect(stkLines).toHaveLength(2)
    for (const l of stkLines) {
      // Task 13/14 denorms: itemId always set; itemName never a fallback
      // placeholder; system + physical default to matched.
      expect(l.itemId).toBe(itemId)
      expect(l.itemName).not.toMatch(/unresolved/i)
      expect(l.itemName).not.toBe("")
      expect(l.physicalQuantity).toBe(l.systemQuantity)
      expect(l.discrepancy).toBe(0)
    }
    const stkVariantLine = stkLines.find((l) => l.variantId !== null)
    const stkUnresolvedLine = stkLines.find((l) => l.variantId === null)
    expect(stkVariantLine).toBeDefined()
    expect(stkVariantLine?.systemQuantity).toBe(4)
    expect(stkVariantLine?.itemName).toContain("Burgundy")
    expect(stkVariantLine?.itemName).toContain("M")
    expect(stkUnresolvedLine).toBeDefined()
    expect(stkUnresolvedLine?.systemQuantity).toBe(2)
    expect(stkUnresolvedLine?.itemName).toContain("E2E-1")
  })
})

describe("Plan 2a E2E — variant-scoped chain", () => {
  it("specifies at the store before transfer → transfers variant-scoped → shop receives variant-keyed row", async () => {
    // ---- 1. Catalog seed ----
    const itemId = await seedItem({
      articleNumber: "E2E-2",
      name: "Trouser",
      minimumSellPriceUgx: "300.00",
    })
    const navyId = await seedColor({
      itemId,
      colorName: "Navy",
      colorHex: "#0A1F44",
    })

    await seedStore({ name: "E2E Store 2" })

    const supplierId = await seedSupplier()
    const supplyRouteId = await seedSupplyRoute()
    const supplyLineId = await insertAggregateSupplyLine({
      supplyRouteId,
      supplierId,
      itemId,
      quantity: 10,
      totalCostUgx: "1500.00", // 150 UGX/unit
    })

    // ---- 2. Receive 10 unresolved into the store ----
    await callServerFn(() =>
      receiveGoods({
        data: {
          supplyRouteId,
          items: [{ supplyRouteLineId: supplyLineId, quantityReceived: 10 }],
        },
      }),
    )

    const unresolvedRow = await db.query.storeStock.findFirst({
      where: and(
        eq(storeStock.itemId, itemId),
        isNull(storeStock.variantId),
      ),
    })
    if (!unresolvedRow) throw new Error("Expected unresolved store row")
    expect(unresolvedRow.quantityOnHand).toBe(10)

    // ---- 3. Specify 6 → Navy/L at the store (Plan 1 specifyStock) ----
    await callServerFn(() =>
      specifyStock({
        data: {
          storeStockId: unresolvedRow.id,
          lines: [{ colorId: navyId, size: "L", quantity: 6 }],
        },
      }),
    )

    const storeRowsAfterSpecify = await db.query.storeStock.findMany({
      where: eq(storeStock.itemId, itemId),
    })
    expect(storeRowsAfterSpecify).toHaveLength(2)
    const variantStoreRow = storeRowsAfterSpecify.find(
      (r) => r.variantId !== null,
    )
    const leftoverStoreRow = storeRowsAfterSpecify.find(
      (r) => r.variantId === null,
    )
    assertDefined(variantStoreRow, "Expected variant-keyed store row")
    assertDefined(leftoverStoreRow, "Expected leftover store row")
    expect(variantStoreRow.quantityOnHand).toBe(6)
    expect(leftoverStoreRow.quantityOnHand).toBe(4)
    expect(variantStoreRow.supplyRouteLineId).toBe(supplyLineId)
    expect(variantStoreRow.costPerUnitUgx).toBe(unresolvedRow.costPerUnitUgx)
    const variantId = variantStoreRow.variantId
    assertDefined(variantId, "Expected variant id on specified row")

    // ---- 4. Transfer 3 variant-scoped to a shop ----
    const shopId = await seedShop({ name: "E2E Shop 2" })
    await callServerFn(() =>
      createTransfer({
        data: {
          shopId,
          items: [
            { itemId, variantId, quantityDispatched: 3 },
          ],
        },
      }),
    )
    const transfer = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.shopId, shopId),
    })
    if (!transfer) throw new Error("Transfer not persisted")

    const tLine = await db.query.storeTransferLines.findFirst({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    if (!tLine) throw new Error("Transfer line not persisted")
    expect(tLine.variantId).toBe(variantId)
    expect(tLine.itemId).toBe(itemId)

    const allocs = await db.query.storeTransferAllocations.findMany({
      where: eq(storeTransferAllocations.storeTransferLineId, tLine.id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].quantity).toBe(3)
    expect(allocs[0].supplyRouteLineId).toBe(supplyLineId)
    expect(allocs[0].costPerUnitUgx).toBe(variantStoreRow.costPerUnitUgx)

    // ---- 5. Confirm full receipt at the shop ----
    await callServerFn(() =>
      confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: [{ transferItemId: tLine.id, quantityReceived: 3 }],
        },
      }),
    )

    const shopRows = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(shopRows).toHaveLength(1)
    expect(shopRows[0].variantId).toBe(variantId)
    expect(shopRows[0].quantityOnHand).toBe(3)
    expect(shopRows[0].supplyRouteLineId).toBe(supplyLineId)
    // Cost provenance preserved across receive → specify → transfer →
    // confirm hop.
    expect(shopRows[0].costPerUnitUgx).toBe(unresolvedRow.costPerUnitUgx)

    // The transfer header should be marked received.
    const transferAfter = await db.query.storeTransfers.findFirst({
      where: eq(storeTransfers.id, transfer.id),
    })
    expect(transferAfter?.status).toBe("received")
  })
})
