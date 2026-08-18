import { eq } from 'drizzle-orm'
import {
  items,
  itemArticleNumbers,
  itemColors,
  supplyRouteLines,
  storeStock,
  shopStock,
  storeTransferLines,
  shopSaleLines,
  shopReturnLines,
  storeReturnLines,
  stockTakeLines,
  variants,
} from '#/db/schema'
import type { Tx } from '#/db'

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
  'store.receiveGoods': async (tx, { entityId }) => {
    const rows = await tx
      .select({ articleNumber: itemArticleNumbers.articleNumber })
      .from(supplyRouteLines)
      .innerJoin(itemColors, eq(itemColors.id, supplyRouteLines.colorId))
      .innerJoin(items, eq(items.id, itemColors.itemId))
      .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
      .where(eq(supplyRouteLines.supplyRouteId, entityId))
    return rows.map((r) => r.articleNumber)
  },
  'transfer.create': resolveByTransferId,
  'transfer.receive': resolveByTransferId,
  'sale.create': resolveBySaleId,
  'shopReturn.create': resolveByShopReturnId,
  'storeReturn.dispatch': resolveByStoreReturnId,
  'storeReturn.receive': resolveByStoreReturnId,
  'stockTake.reconcile': resolveByStockTakeId,
  'stockTake.start': resolveByStockTakeId,
  'stock.specify': resolveBySpecifyStock,
}

// Stock tables now address inventory via `variant_id` (issue #4), so we
// hop stock → variants → item_colors → items instead of stock → item_colors.
async function resolveByTransferId(
  tx: Tx,
  { entityId }: ResolverInput,
): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(storeTransferLines)
    .innerJoin(storeStock, eq(storeStock.id, storeTransferLines.storeStockId))
    .innerJoin(variants, eq(variants.id, storeStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(storeTransferLines.storeTransferId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveBySaleId(
  tx: Tx,
  { entityId }: ResolverInput,
): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(shopSaleLines)
    .innerJoin(shopStock, eq(shopStock.id, shopSaleLines.shopStockId))
    .innerJoin(variants, eq(variants.id, shopStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(shopSaleLines.shopSaleId, entityId))
  return rows.map((r) => r.articleNumber)
}

async function resolveByShopReturnId(
  tx: Tx,
  { entityId }: ResolverInput,
): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(shopReturnLines)
    .innerJoin(shopStock, eq(shopStock.id, shopReturnLines.shopStockId))
    .innerJoin(variants, eq(variants.id, shopStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(shopReturnLines.shopReturnId, entityId))
  return rows.map((r) => r.articleNumber)
}

// storeReturnLines references shopStock (not storeStock) via shopStockId.
// See src/db/schema/returns.ts:150 — storeReturnLines.shopStockId references shopStock.id.
async function resolveByStoreReturnId(
  tx: Tx,
  { entityId }: ResolverInput,
): Promise<string[]> {
  const rows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(storeReturnLines)
    .innerJoin(shopStock, eq(shopStock.id, storeReturnLines.shopStockId))
    .innerJoin(variants, eq(variants.id, shopStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(storeReturnLines.storeReturnId, entityId))
  return rows.map((r) => r.articleNumber)
}

// `stock.specify` deletes the source store_stock row when fully resolved,
// so `entityId` may not point at a live row. Prefer the itemId carried in
// metadata, with a fallback to the storeStock → items join for the
// partial-specify case where the source row is still around.
async function resolveBySpecifyStock(
  tx: Tx,
  { entityId, metadata }: ResolverInput,
): Promise<string[]> {
  const meta = metadata as { itemId?: string } | null | undefined
  if (meta?.itemId) {
    const rows = await tx
      .select({ articleNumber: itemArticleNumbers.articleNumber })
      .from(items)
      .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
      .where(eq(items.id, meta.itemId))
    return rows.map((r) => r.articleNumber)
  }
  const rows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(storeStock)
    .innerJoin(items, eq(items.id, storeStock.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(storeStock.id, entityId))
  return rows.map((r) => r.articleNumber)
}

// stockTakeLines has nullable storeStockId and shopStockId (no direct variantId).
// Resolve by joining through either storeStock or shopStock, depending on which column is set.
// Two queries unioned in JS — simpler than a CASE/COALESCE join. innerJoin skips NULL rows.
async function resolveByStockTakeId(
  tx: Tx,
  { entityId }: ResolverInput,
): Promise<string[]> {
  const storeRows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(stockTakeLines)
    .innerJoin(storeStock, eq(storeStock.id, stockTakeLines.storeStockId))
    .innerJoin(variants, eq(variants.id, storeStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(stockTakeLines.stockTakeId, entityId))

  const shopRows = await tx
    .select({ articleNumber: itemArticleNumbers.articleNumber })
    .from(stockTakeLines)
    .innerJoin(shopStock, eq(shopStock.id, stockTakeLines.shopStockId))
    .innerJoin(variants, eq(variants.id, shopStock.variantId))
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .innerJoin(items, eq(items.id, itemColors.itemId))
    .innerJoin(itemArticleNumbers, eq(itemArticleNumbers.itemId, items.id))
    .where(eq(stockTakeLines.stockTakeId, entityId))

  return [...storeRows, ...shopRows].map((r) => r.articleNumber)
}
