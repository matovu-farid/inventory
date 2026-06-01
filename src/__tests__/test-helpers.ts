/**
 * Shared test helpers.
 *
 * Two flavours live here:
 *  - **Narrowing assertions** (e.g. `assertDefined`) used by every test
 *    to satisfy `@typescript-eslint/no-non-null-assertion` without
 *    disabling the rule.
 *  - **DB seeding helpers** (introduced for Plan 2a, Task 6 of the
 *    variant-flexibility rollout) that consolidate the FK chain
 *    `supplier → supply_route → supply_route_line → store_stock`
 *    behind small, signature-stable functions. Tasks 7, 8, 11 reuse
 *    these to avoid the inline-seed copy-paste that previous suites
 *    accumulated.
 *
 * Reset semantics: `resetTestDb` delegates to the same
 * `cleanupAllTestData` used by the Cypress + integration suites so the
 * truncation order (TRUNCATE ... CASCADE in FK-safe order) stays in
 * one place.
 */

import pg from "pg"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "#/db"
import {
  itemColors,
  items,
  shops,
  shopStock,
  storeStock,
  stores,
  suppliers,
  supplyRouteLines,
  supplyRoutes,
  variants,
} from "#/db/schema"
import { cleanupAllTestData } from "../../cypress/support/cleanup"

export function assertDefined<T>(
  value: T | null | undefined,
  message?: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined")
  }
}

/**
 * Wipe every table the integration tests touch using TRUNCATE … CASCADE.
 *
 * Uses a short-lived `pg.Client` because `cleanupAllTestData` expects a
 * raw pg client (it's also exercised by Cypress) and the Drizzle handle
 * here doesn't expose one directly.
 */
export async function resetTestDb(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  if (!/test/i.test(url)) {
    throw new Error(
      "resetTestDb refuses to run: DATABASE_URL must point at a test " +
        "database. Run via `pnpm test` (which loads .env.test).",
    )
  }
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await cleanupAllTestData(client)
  } finally {
    await client.end()
  }
}

export async function seedItem(input: {
  articleNumber: string
  name: string
  category?: string
  minimumSellPriceUgx?: string
}): Promise<string> {
  const [row] = await db
    .insert(items)
    .values({
      articleNumber: input.articleNumber,
      name: input.name,
      category: input.category ?? "Test",
      minimumSellPriceUgx: input.minimumSellPriceUgx ?? "0",
    })
    .returning()
  assertDefined(row, "seedItem: insert returned no row")
  return row.id
}

export async function seedColor(input: {
  itemId: string
  colorName: string
  colorHex: string
}): Promise<string> {
  const [row] = await db
    .insert(itemColors)
    .values({
      itemId: input.itemId,
      colorName: input.colorName,
      colorHex: input.colorHex,
    })
    .returning()
  assertDefined(row, "seedColor: insert returned no row")
  return row.id
}

export async function seedStore(input?: { name?: string }): Promise<string> {
  const [row] = await db
    .insert(stores)
    .values({ name: input?.name ?? "Test Store" })
    .returning()
  assertDefined(row, "seedStore: insert returned no row")
  return row.id
}

export async function seedShop(input?: { name?: string }): Promise<string> {
  const [row] = await db
    .insert(shops)
    .values({ name: input?.name ?? `Test Shop ${Math.random().toString(36).slice(2, 8)}` })
    .returning()
  assertDefined(row, "seedShop: insert returned no row")
  return row.id
}

export async function seedSupplier(input?: { name?: string }): Promise<string> {
  const name = input?.name ?? `Test Supplier ${Math.random().toString(36).slice(2, 8)}`
  const [row] = await db
    .insert(suppliers)
    .values({ name, type: "international" })
    .returning()
  assertDefined(row, "seedSupplier: insert returned no row")
  return row.id
}

export async function seedSupplyRoute(input?: { name?: string }): Promise<string> {
  const name = input?.name ?? `Test Route ${Math.random().toString(36).slice(2, 8)}`
  const [row] = await db
    .insert(supplyRoutes)
    .values({ name, status: "in_transit" })
    .returning()
  assertDefined(row, "seedSupplyRoute: insert returned no row")
  return row.id
}

/**
 * Seed a supply_route_line. Auto-creates the route + supplier when not
 * passed — callers don't usually care which route a FIFO line belongs
 * to, just its `createdAt` ordering and (color, size) tuple.
 *
 * `createdAt` is overridable so FIFO ordering tests can pin timestamps
 * deterministically rather than rely on insertion-order luck.
 */
export async function seedSupplyRouteLine(input: {
  itemId: string
  colorId?: string | null
  size?: string | null
  quantity?: number
  unitPriceForeign?: string
  createdAt?: string | Date
  supplyRouteId?: string
  supplierId?: string
}): Promise<string> {
  const supplyRouteId = input.supplyRouteId ?? (await seedSupplyRoute())
  const supplierId = input.supplierId ?? (await seedSupplier())
  const quantity = input.quantity ?? 10
  const unitPriceForeign = input.unitPriceForeign ?? "10.00"
  const totalAmountForeign = (
    Number(unitPriceForeign) * quantity
  ).toFixed(2)
  const createdAt =
    input.createdAt === undefined
      ? undefined
      : input.createdAt instanceof Date
        ? input.createdAt
        : new Date(input.createdAt)

  const [row] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId,
      supplierId,
      itemId: input.itemId,
      colorId: input.colorId ?? null,
      size: input.size ?? null,
      quantity,
      unitPriceForeign,
      foreignCurrency: "RMB",
      totalAmountForeign,
      // totalCostUgx is required (notNull) — a placeholder is fine for
      // FIFO tests which only read the row's createdAt + ids.
      totalCostUgx: totalAmountForeign,
      ...(createdAt ? { createdAt } : {}),
    })
    .returning()
  assertDefined(row, "seedSupplyRouteLine: insert returned no row")
  return row.id
}

/**
 * Seed a single store_stock lot.
 *
 * Variant resolution rules (mirror the production write path):
 *  - When `variantId === null` is passed explicitly → unresolved lot.
 *  - When `variantId` is a string → use as-is.
 *  - When `variantId` is omitted but `colorId` + `size` are provided →
 *    look up or create the matching variant.
 *  - Anything else throws (the test author probably meant unresolved).
 */
export async function seedStoreStockLot(input: {
  storeId: string
  itemId: string
  variantId?: string | null
  colorId?: string
  size?: string
  supplyRouteLineId: string | null
  quantity: number
  costPerUnitUgx: string
}): Promise<{ stockId: string; variantId: string | null }> {
  let resolvedVariantId: string | null
  if (input.variantId === null) {
    resolvedVariantId = null
  } else if (typeof input.variantId === "string") {
    resolvedVariantId = input.variantId
  } else if (input.colorId && input.size) {
    const existing = await db.query.variants.findFirst({
      where: and(
        eq(variants.itemId, input.itemId),
        eq(variants.colorId, input.colorId),
        eq(variants.size, input.size),
      ),
    })
    if (existing) {
      resolvedVariantId = existing.id
    } else {
      const [created] = await db
        .insert(variants)
        .values({
          itemId: input.itemId,
          colorId: input.colorId,
          size: input.size,
        })
        .returning()
      assertDefined(created, "seedStoreStockLot: variant insert returned no row")
      resolvedVariantId = created.id
    }
  } else {
    throw new Error(
      "seedStoreStockLot: pass variantId (or null), or both colorId + size",
    )
  }

  const [row] = await db
    .insert(storeStock)
    .values({
      storeId: input.storeId,
      itemId: input.itemId,
      variantId: resolvedVariantId,
      supplyRouteLineId: input.supplyRouteLineId,
      quantityOnHand: input.quantity,
      costPerUnitUgx: input.costPerUnitUgx,
    })
    .returning()
  assertDefined(row, "seedStoreStockLot: insert returned no row")
  return { stockId: row.id, variantId: resolvedVariantId }
}

/**
 * Seed a single unresolved shop_stock lot (variantId NULL).
 *
 * Auto-creates a supply_route_line when none is provided so the resulting
 * row carries the supply-line provenance that `specifyShopStock` inherits
 * onto the variant-keyed children.
 */
export async function seedUnresolvedShopStock(input: {
  shopId: string
  itemId: string
  supplyRouteLineId?: string | null
  quantity: number
  costPerUnitUgx: string
}): Promise<{ stockId: string; supplyRouteLineId: string | null }> {
  const supplyRouteLineId =
    input.supplyRouteLineId === undefined
      ? await seedSupplyRouteLine({
          itemId: input.itemId,
          quantity: input.quantity,
        })
      : input.supplyRouteLineId

  const [row] = await db
    .insert(shopStock)
    .values({
      shopId: input.shopId,
      itemId: input.itemId,
      variantId: null,
      supplyRouteLineId,
      quantityOnHand: input.quantity,
      costPerUnitUgx: input.costPerUnitUgx,
    })
    .returning()
  assertDefined(row, "seedUnresolvedShopStock: insert returned no row")
  return { stockId: row.id, supplyRouteLineId }
}

// Re-exported so tests can build `where`-clause asserts off the same
// drizzle helpers they pass to seed* functions without a separate import.
export { and, eq, isNull }
