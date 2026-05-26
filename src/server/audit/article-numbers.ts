import { eq } from "drizzle-orm"
import {
  items,
  itemColors,
  supplyRouteItems,
  storeStock,
  shopStock,
  storeTransferItems,
  shopSaleItems,
  shopReturnItems,
  storeReturnItems,
  stockTakeItems,
} from "#/db/schema"
import type { Database } from "#/db"

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]

interface ResolverInput {
  action: string
  entityType: string
  entityId: string
  metadata: unknown
}

export async function resolveArticleNumbersForAudit(
  tx: Tx,
  input: ResolverInput,
): Promise<string[]> {
  const fn = RESOLVERS[input.action]
  if (!fn) return []
  const raw = await fn(tx, input)
  return Array.from(new Set(raw)).sort()
}

type Resolver = (tx: Tx, input: ResolverInput) => Promise<string[]>

const RESOLVERS: Partial<Record<string, Resolver>> = {
  "store.receiveGoods": async (tx, { entityId }) => {
    const rows = await tx
      .select({ articleNumber: items.articleNumber })
      .from(supplyRouteItems)
      .innerJoin(itemColors, eq(itemColors.id, supplyRouteItems.productColorId))
      .innerJoin(items, eq(items.id, itemColors.itemId))
      .where(eq(supplyRouteItems.supplyRouteId, entityId))
    return rows.map((r) => r.articleNumber)
  },
  "transfer.create": resolveByTransferId,
  "transfer.receive": resolveByTransferId,
  "sale.create": resolveBySaleId,
  "shopReturn.create": resolveByShopReturnId,
  "storeReturn.dispatch": resolveByStoreReturnId,
  "storeReturn.receive": resolveByStoreReturnId,
  "stockTake.reconcile": resolveByStockTakeId,
  "stockTake.start": resolveByStockTakeId,
}

async function resolveByTransferId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: items.articleNumber })
    .from(storeTransferItems)
    .innerJoin(storeStock, eq(storeStock.id, storeTransferItems.storeStockId))
    .innerJoin(itemColors, eq(itemColors.id, storeStock.productColorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .where(eq(storeTransferItems.storeTransferId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveBySaleId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: items.articleNumber })
    .from(shopSaleItems)
    .innerJoin(shopStock, eq(shopStock.id, shopSaleItems.shopStockId))
    .innerJoin(itemColors, eq(itemColors.id, shopStock.productColorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .where(eq(shopSaleItems.shopSaleId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveByShopReturnId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: items.articleNumber })
    .from(shopReturnItems)
    .innerJoin(shopStock, eq(shopStock.id, shopReturnItems.shopStockId))
    .innerJoin(itemColors, eq(itemColors.id, shopStock.productColorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .where(eq(shopReturnItems.shopReturnId, entityId))
  return rows.map((r) => r.articleNumber)
}

// storeReturnItems references shopStock (not storeStock) via shopStockId.
// See src/db/schema/returns.ts:150 — storeReturnItems.shopStockId references shopStock.id.
async function resolveByStoreReturnId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: items.articleNumber })
    .from(storeReturnItems)
    .innerJoin(shopStock, eq(shopStock.id, storeReturnItems.shopStockId))
    .innerJoin(itemColors, eq(itemColors.id, shopStock.productColorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .where(eq(storeReturnItems.storeReturnId, entityId))
  return rows.map((r) => r.articleNumber)
}

// stockTakeItems has nullable storeStockId and shopStockId (no direct productColorId).
// Resolve by joining through either storeStock or shopStock, depending on which column is set.
// Two queries unioned in JS — simpler than a CASE/COALESCE join. innerJoin skips NULL rows.
async function resolveByStockTakeId(tx: Tx, { entityId }: ResolverInput): Promise<string[]> {
  const storeRows = await tx
    .select({ articleNumber: items.articleNumber })
    .from(stockTakeItems)
    .innerJoin(storeStock, eq(storeStock.id, stockTakeItems.storeStockId))
    .innerJoin(itemColors, eq(itemColors.id, storeStock.productColorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .where(eq(stockTakeItems.stockTakeId, entityId))

  const shopRows = await tx
    .select({ articleNumber: items.articleNumber })
    .from(stockTakeItems)
    .innerJoin(shopStock, eq(shopStock.id, stockTakeItems.shopStockId))
    .innerJoin(itemColors, eq(itemColors.id, shopStock.productColorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .where(eq(stockTakeItems.stockTakeId, entityId))

  return [...storeRows, ...shopRows].map((r) => r.articleNumber)
}
