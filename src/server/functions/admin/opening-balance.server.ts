// Server-only: opening balance mutations. Split from opening-balance.ts because
// that file is client-reachable via opening-balance-form.tsx.

import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db } from '#/db'
import {
  itemColors,
  items,
  shopStock,
  shops,
  storeStock,
  variants,
} from '#/db/schema'
import { postJournalEntry } from '#/lib/accounting/ledger'
import { recordAuditLog } from '#/server/middleware/audit-store'
import { validateOpeningBalanceCell } from './opening-balance-validate'
import { renderAuditDescription } from '#/server/audit/descriptions'
import { getActorName } from '#/server/audit/actor'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const cellSchema = z
  .object({
    variantId: z.uuid().nullable().optional(),
    colorId: z.uuid().optional(),
    size: z.string().min(1).max(16).optional(),
    quantity: z.number().int().positive(),
  })
  .superRefine((cell, ctx) => {
    try {
      validateOpeningBalanceCell(cell, '1')
    } catch (err) {
      ctx.addIssue({
        code: 'custom',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  })

export const itemEntry = z.object({
  itemId: z.uuid(),
  unitCostUgx: z.string().min(1),
  minimumSellPriceUgx: z.string().min(1).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  cells: z.array(cellSchema).min(1),
})

export const storeOpeningInput = z.object({ items: z.array(itemEntry).min(1) })
export const shopOpeningInput = z.object({
  shopId: z.uuid(),
  items: z.array(itemEntry).min(1),
})

type CellInput = z.infer<typeof cellSchema>
type NormalisedCell = { variantId: string | null; quantity: number }

interface NormalisedItemEntry {
  itemId: string
  unitCostUgx: string
  minimumSellPriceUgx?: string
  lowStockThreshold?: number
  cells: NormalisedCell[]
}

interface ResolvedVariant {
  variantId: string
  colorName: string
  size: string
}

type AuditLine = {
  variantId: string | null
  colorName: string | null
  size: string | null
  quantity: number
}

async function resolveVariantContext(
  tx: Tx,
  cells: NormalisedCell[],
): Promise<Map<string, ResolvedVariant>> {
  const ids = Array.from(
    new Set(
      cells.map((c) => c.variantId).filter((id): id is string => id !== null),
    ),
  )
  if (ids.length === 0) return new Map()

  const rows = await tx
    .select({
      variantId: variants.id,
      size: variants.size,
      colorName: itemColors.colorName,
    })
    .from(variants)
    .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
    .where(inArray(variants.id, ids))

  if (rows.length !== ids.length) {
    const missing = ids.filter((id) => !rows.some((r) => r.variantId === id))
    throw new Error(
      `Variant(s) not found: ${missing.join(
        ', ',
      )}. Pick a variant from the catalog before submitting opening balance.`,
    )
  }

  return new Map(
    rows.map((r) => [
      r.variantId,
      { variantId: r.variantId, colorName: r.colorName, size: r.size },
    ]),
  )
}

async function normaliseOpeningBalanceCell(
  tx: Tx,
  itemId: string,
  cell: CellInput,
): Promise<NormalisedCell> {
  if (
    typeof cell.variantId === 'string' &&
    (cell.colorId !== undefined || cell.size !== undefined)
  ) {
    throw new Error('variantId cannot be combined with colorId or size')
  }
  if (typeof cell.variantId === 'string') {
    const existing = await tx.query.variants.findFirst({
      where: eq(variants.id, cell.variantId),
    })
    if (!existing) {
      throw new Error(`Variant ${cell.variantId} not found`)
    }
    if (existing.itemId !== itemId) {
      throw new Error(
        `Variant ${cell.variantId} does not belong to item ${itemId}`,
      )
    }
    return { variantId: cell.variantId, quantity: cell.quantity }
  }
  if (
    cell.variantId === null &&
    cell.colorId === undefined &&
    cell.size === undefined
  ) {
    return { variantId: null, quantity: cell.quantity }
  }

  if (cell.colorId === undefined || cell.size === undefined) {
    throw new Error('Color and size are required for a variant opening balance')
  }
  const colorId = cell.colorId
  const size = cell.size.trim()

  const color = await tx.query.itemColors.findFirst({
    where: eq(itemColors.id, colorId),
  })
  if (!color) throw new Error(`Color ${colorId} not found`)
  if (color.itemId !== itemId) {
    throw new Error(`Color ${colorId} does not belong to item ${itemId}`)
  }

  const existingVariant = (
    await tx.query.variants.findMany({
      where: and(eq(variants.itemId, itemId), eq(variants.colorId, colorId)),
    })
  ).find(
    (variant) =>
      variant.size.trim().toLocaleLowerCase() === size.toLocaleLowerCase(),
  )
  if (existingVariant) {
    return { variantId: existingVariant.id, quantity: cell.quantity }
  }

  const [variantRow] = await tx
    .insert(variants)
    .values({ itemId, colorId, size })
    .onConflictDoUpdate({
      target: [variants.itemId, variants.colorId, variants.size],
      set: { updatedAt: new Date() },
    })
    .returning()

  return { variantId: variantRow.id, quantity: cell.quantity }
}

async function normaliseOpeningBalanceItems(
  tx: Tx,
  itemEntries: z.infer<typeof storeOpeningInput>['items'],
): Promise<NormalisedItemEntry[]> {
  const normalised: NormalisedItemEntry[] = []
  const seenCells = new Set<string>()
  for (const entry of itemEntries) {
    const cells: NormalisedCell[] = []
    for (const cell of entry.cells) {
      const normalisedCell = await normaliseOpeningBalanceCell(
        tx,
        entry.itemId,
        cell,
      )
      const cellKey = `${entry.itemId}:${normalisedCell.variantId ?? 'unresolved'}`
      if (seenCells.has(cellKey)) {
        throw new Error(
          `Duplicate opening balance cell for item ${entry.itemId} and ${normalisedCell.variantId ? `variant ${normalisedCell.variantId}` : 'unresolved stock'}`,
        )
      }
      seenCells.add(cellKey)
      cells.push(normalisedCell)
    }
    normalised.push({
      itemId: entry.itemId,
      unitCostUgx: entry.unitCostUgx,
      minimumSellPriceUgx: entry.minimumSellPriceUgx,
      lowStockThreshold: entry.lowStockThreshold,
      cells,
    })
  }
  return normalised
}

function validateOpeningBalanceItems(
  itemEntries: z.infer<typeof storeOpeningInput>['items'],
): void {
  const thresholdsByItem = new Map<string, number>()
  const minimumPricesByItem = new Map<string, string>()
  for (const entry of itemEntries) {
    if (entry.minimumSellPriceUgx !== undefined) {
      const minimumSellPrice = new BigNumber(entry.minimumSellPriceUgx)
      if (!minimumSellPrice.isFinite() || minimumSellPrice.isNegative()) {
        throw new Error('minimumSellPriceUgx must be a non-negative amount')
      }
      const normalizedMinimumSellPrice = minimumSellPrice.toFixed(2)
      const previous = minimumPricesByItem.get(entry.itemId)
      if (previous !== undefined && previous !== normalizedMinimumSellPrice) {
        throw new Error(
          `Opening balance contains conflicting minimum sell prices for item ${entry.itemId}`,
        )
      }
      minimumPricesByItem.set(entry.itemId, normalizedMinimumSellPrice)
    }
    if (entry.lowStockThreshold !== undefined) {
      const previous = thresholdsByItem.get(entry.itemId)
      if (previous !== undefined && previous !== entry.lowStockThreshold) {
        throw new Error(
          `Opening balance contains conflicting low-stock thresholds for item ${entry.itemId}`,
        )
      }
      thresholdsByItem.set(entry.itemId, entry.lowStockThreshold)
    }
    for (const cell of entry.cells) {
      validateOpeningBalanceCell(cell, entry.unitCostUgx)
    }
  }
}

async function postOpeningBalanceStock(
  tx: Tx,
  params: {
    normalisedItems: NormalisedItemEntry[]
    variantById: Map<string, ResolvedVariant>
    userId: string
    itemCount: number
    inventoryCategory: 'Inventory - Store' | 'Inventory - Shop'
    locationType: 'store' | 'shop'
    locationId: string
    auditAction: 'openingBalance.store' | 'openingBalance.shop'
    entityType: 'store_stock' | 'shop_stock'
    shopName?: string
    insertStock: (args: {
      itemId: string
      variantId: string | null
      quantity: number
      costPerUnitUgx: string
      minimumSellPriceUgx: string
    }) => Promise<{ id: string }>
  },
) {
  const {
    normalisedItems,
    variantById,
    userId,
    itemCount,
    inventoryCategory,
    locationType,
    locationId,
    auditAction,
    entityType,
    shopName,
    insertStock,
  } = params

  const createdIds: string[] = []
  let totalValue = new BigNumber(0)
  const auditLines: AuditLine[] = []

  for (const entry of normalisedItems) {
    const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
    const item = await tx.query.items.findFirst({
      where: eq(items.id, entry.itemId),
      columns: { minimumSellPriceUgx: true },
    })
    if (!item) throw new Error(`Item not found: ${entry.itemId}`)
    const minimumSellPriceUgx =
      entry.minimumSellPriceUgx !== undefined
        ? new BigNumber(entry.minimumSellPriceUgx).toFixed(2)
        : item.minimumSellPriceUgx
    if (
      entry.minimumSellPriceUgx !== undefined ||
      entry.lowStockThreshold !== undefined
    ) {
      await tx
        .update(items)
        .set({
          ...(entry.minimumSellPriceUgx !== undefined
            ? { minimumSellPriceUgx }
            : {}),
          ...(entry.lowStockThreshold !== undefined
            ? { lowStockThreshold: entry.lowStockThreshold }
            : {}),
        })
        .where(eq(items.id, entry.itemId))
    }
    let entryValue = new BigNumber(0)
    const entryRowIds: string[] = []

    for (const cell of entry.cells) {
      let ctx: ResolvedVariant | null = null
      if (cell.variantId !== null) {
        const resolved = variantById.get(cell.variantId)
        if (!resolved) {
          throw new Error(`Variant ${cell.variantId} not resolved`)
        }
        ctx = resolved
      }
      const row = await insertStock({
        itemId: entry.itemId,
        variantId: cell.variantId,
        quantity: cell.quantity,
        costPerUnitUgx: cost.toFixed(2),
        minimumSellPriceUgx,
      })
      entryRowIds.push(row.id)
      createdIds.push(row.id)
      entryValue = entryValue.plus(cost.times(cell.quantity))
      auditLines.push({
        variantId: cell.variantId,
        colorName: ctx?.colorName ?? null,
        size: ctx?.size ?? null,
        quantity: cell.quantity,
      })
    }

    await postJournalEntry(tx, {
      entries: [
        {
          type: 'debit',
          category: inventoryCategory,
          amount: entryValue.toFixed(2),
        },
        {
          type: 'credit',
          category: "Owner's Equity",
          amount: entryValue.toFixed(2),
        },
      ],
      referenceType: 'opening_balance',
      referenceId: entryRowIds[0],
      locationType,
      locationId,
      recordedBy: userId,
      description: `Opening balance: ${entry.cells.length} cell(s) of item ${entry.itemId}`,
    })

    totalValue = totalValue.plus(entryValue)
  }

  const actorName = await getActorName(tx, userId)

  await recordAuditLog(tx, {
    actorUserId: userId,
    action: auditAction,
    entityType,
    entityId: createdIds[0],
    description: renderAuditDescription(auditAction, {
      actorName,
      itemCount,
      shopName,
    }),
    articleNumbers: [],
    metadata: {
      ...(shopName ? { shopId: locationId } : {}),
      itemCount: createdIds.length,
      totalValueUgx: totalValue.toFixed(2),
      stockIds: createdIds,
      lines: auditLines,
    },
  })

  return {
    itemCount: createdIds.length,
    totalValueUgx: totalValue.toFixed(2),
    stockIds: createdIds,
  }
}

export async function addStoreOpeningBalanceQuery(
  data: z.infer<typeof storeOpeningInput>,
  userId: string,
) {
  validateOpeningBalanceItems(data.items)

  const store = await db.query.stores.findFirst()
  if (!store) throw new Error('Store not configured')

  return db.transaction(async (tx) => {
    const normalisedItems = await normaliseOpeningBalanceItems(tx, data.items)
    const allCells = normalisedItems.flatMap((e) => e.cells)
    const variantById = await resolveVariantContext(tx, allCells)

    return postOpeningBalanceStock(tx, {
      normalisedItems,
      variantById,
      userId,
      itemCount: data.items.length,
      inventoryCategory: 'Inventory - Store',
      locationType: 'store',
      locationId: store.id,
      auditAction: 'openingBalance.store',
      entityType: 'store_stock',
      insertStock: async ({
        itemId,
        variantId,
        quantity,
        costPerUnitUgx,
        minimumSellPriceUgx,
      }) => {
        const [row] = await tx
          .insert(storeStock)
          .values({
            storeId: store.id,
            itemId,
            variantId,
            supplyRouteLineId: null,
            quantityOnHand: quantity,
            costPerUnitUgx,
            minimumSellPriceUgx,
          })
          .returning()
        return row
      },
    })
  })
}

export async function addShopOpeningBalanceQuery(
  data: z.infer<typeof shopOpeningInput>,
  userId: string,
) {
  validateOpeningBalanceItems(data.items)

  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, data.shopId),
  })
  if (!shop) throw new Error(`Shop not found: ${data.shopId}`)

  return db.transaction(async (tx) => {
    const normalisedItems = await normaliseOpeningBalanceItems(tx, data.items)
    const allCells = normalisedItems.flatMap((e) => e.cells)
    const variantById = await resolveVariantContext(tx, allCells)

    return postOpeningBalanceStock(tx, {
      normalisedItems,
      variantById,
      userId,
      itemCount: data.items.length,
      inventoryCategory: 'Inventory - Shop',
      locationType: 'shop',
      locationId: shop.id,
      auditAction: 'openingBalance.shop',
      entityType: 'shop_stock',
      shopName: shop.name,
      insertStock: async ({
        itemId,
        variantId,
        quantity,
        costPerUnitUgx,
        minimumSellPriceUgx,
      }) => {
        const [row] = await tx
          .insert(shopStock)
          .values({
            shopId: shop.id,
            itemId,
            variantId,
            supplyRouteLineId: null,
            storeTransferItemId: null,
            quantityOnHand: quantity,
            costPerUnitUgx,
            minimumSellPriceUgx,
          })
          .returning()
        return row
      },
    })
  })
}
