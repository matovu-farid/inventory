import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db } from '#/db'
import {
  itemColors,
  itemArticleNumbers,
  items,
  storeReceivings,
  suppliers,
  supplyRouteLines,
  supplyRouteReceipts,
  supplyRoutes,
} from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  normalizeReceiptLookupText,
  normalizeReceiptSizes,
} from '#/lib/supply-receipts'
import { normalizeArticleNumber } from '#/lib/items/article-number'
import {
  colorNameToHex,
  isReceiptColorHexList,
  normalizeColorHex,
} from '#/lib/colors/receipt-colors'
import { calculateSupplyLineAmounts } from './items-internals'
import { getSupplierCode } from './supplier-codes.server'
import { materializeVariantsFromColorsSizes } from '../items/variants-materialize'

export const receiptLineInput = z.object({
  itemName: z.string().trim().min(1).max(120).optional(),
  design: z.string().trim().min(1).max(64),
  itemId: z.uuid().nullable().optional(),
  articleNumber: z.string().trim().min(1).max(64),
  colorId: z.uuid().nullable().optional(),
  colorText: z.string().trim().max(200).optional(),
  colorHex: z
    .string()
    .refine(isReceiptColorHexList, 'Colour hex values must be #RRGGBB')
    .optional(),
  size: z.string().trim().max(200).optional(),
  quantity: z.number().int().positive(),
  unitPriceForeign: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/),
  minimumSellPriceUgx: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
})

export const receiptDraft = z.object({
  supplyRouteId: z.uuid(),
  receiptId: z.uuid().optional(),
  supplierId: z.uuid(),
  receiptDate: z.string().optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().max(2000).optional(),
  foreignCurrency: z.enum(['RMB', 'USD', 'UGX']).default('RMB'),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
  lines: z.array(receiptLineInput).min(1),
})

export type ReceiptDraft = z.infer<typeof receiptDraft>
type ReceiptTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== 'object') return false
    const record = current as { code?: unknown; cause?: unknown }
    if (record.code === '23505') return true
    current = record.cause
  }
  return false
}

function splitReceiptValues(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeMinimumSellPrice(
  value: string | null | undefined,
): string | undefined {
  if (value === undefined || value === null || value.trim() === '') {
    return undefined
  }
  const price = new BigNumber(value)
  if (!price.isFinite() || price.isNegative()) {
    throw new Error('Minimum sell price must be a non-negative UGX amount')
  }
  return price.toFixed(2)
}

function normalizeLowStockThreshold(
  value: number | null | undefined,
): number | undefined {
  if (value === undefined || value === null) return undefined
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Low-stock threshold must be a non-negative whole number')
  }
  return value
}

async function materializeReceiptItemAttributes(
  tx: ReceiptTransaction,
  itemId: string,
  line: ReceiptDraft['lines'][number],
) {
  const selectedColor = line.colorId
    ? await tx.query.itemColors.findFirst({
        where: and(
          eq(itemColors.id, line.colorId),
          eq(itemColors.itemId, itemId),
        ),
        columns: { id: true, colorName: true, colorHex: true },
      })
    : undefined
  if (line.colorId && !selectedColor) {
    throw new Error('Colour does not belong to the selected design')
  }

  const colorNames = splitReceiptValues(line.colorText)
  if (
    selectedColor &&
    !colorNames.some(
      (name) =>
        name.toLocaleLowerCase() ===
        selectedColor.colorName.toLocaleLowerCase(),
    )
  ) {
    colorNames.unshift(selectedColor.colorName)
  }
  const colorHexes = splitReceiptValues(line.colorHex)
  const existingColors = await tx.query.itemColors.findMany({
    where: eq(itemColors.itemId, itemId),
    columns: { id: true, colorName: true, colorHex: true },
  })
  const colorIds: string[] = []

  for (const [index, colorName] of colorNames.entries()) {
    const existing = existingColors.find(
      (color) =>
        color.colorName.toLocaleLowerCase() === colorName.toLocaleLowerCase(),
    )
    if (existing) {
      colorIds.push(existing.id)
      continue
    }

    const colorHex =
      normalizeColorHex(colorHexes[index] ?? '') ||
      colorNameToHex(colorName) ||
      '#808080'
    const [created] = await tx
      .insert(itemColors)
      .values({ itemId, colorName, colorHex })
      .returning({ id: itemColors.id })
    colorIds.push(created.id)
  }

  const sizes = normalizeReceiptSizes(line.size ?? '')
  if (colorIds.length > 0 && sizes.length > 0) {
    await materializeVariantsFromColorsSizes({ itemId, colorIds, sizes }, tx)
  }

  return colorIds.length === 1 ? colorIds[0] : (line.colorId ?? null)
}

async function resolveReceiptLineItem(
  tx: ReceiptTransaction,
  line: ReceiptDraft['lines'][number],
  supplier: typeof suppliers.$inferSelect,
  foreignCurrency: ReceiptDraft['foreignCurrency'],
  itemDefaults: Map<
    string,
    {
      costPrice: string
      costCurrency: string
      minimumSellPriceUgx: string
      lowStockThreshold: number
    }
  >,
) {
  const design = line.design.trim()
  const itemName = line.itemName?.trim() || design
  const normalizedDesign = normalizeReceiptLookupText(design)
  const articleNumber = normalizeArticleNumber(line.articleNumber)
  const supplierCode = await getSupplierCode(tx, supplier.id)
  const qualified = `${supplierCode}:${articleNumber}`

  // Keep concurrent receipts from creating two active items for one design.
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${`${supplier.id}:${normalizedDesign}`}, 0))
  `)

  let item = line.itemId
    ? await tx.query.items.findFirst({
        where: and(eq(items.id, line.itemId), isNull(items.deletedAt)),
        with: { articleNumbers: true },
      })
    : undefined

  // A stale itemId must not make a changed/free-text design attach to the
  // wrong catalog item. Resolve by the visible design instead.
  if (
    item &&
    (normalizeReceiptLookupText(item.design) !== normalizedDesign ||
      item.supplierId !== supplier.id)
  ) {
    item = undefined
  }

  const owners = await tx.query.itemArticleNumbers.findMany({
    where: eq(itemArticleNumbers.qualifiedArticleNumber, qualified),
    with: {
      item: {
        columns: { name: true, design: true, supplierId: true },
        with: { supplier: { columns: { name: true } } },
      },
    },
  })
  const ownerItemIds = new Set(owners.map((entry) => entry.itemId))
  if (ownerItemIds.size > 1) {
    throw new Error(
      `Art number "${articleNumber}" has conflicting catalog ownership`,
    )
  }
  const owner = owners.at(0)
  const ownerDesignMatches =
    owner && normalizeReceiptLookupText(owner.item.design) === normalizedDesign
  const ownerSupplierMatches = owner && owner.item.supplierId === supplier.id

  if (owner && (!ownerDesignMatches || !ownerSupplierMatches)) {
    throw new Error(
      `Art number "${articleNumber}" belongs to design "${owner.item.design}" for supplier "${owner.item.supplier?.name ?? 'another supplier'}"`,
    )
  }

  // If duplicate catalog rows share a design, the art number is the more
  // specific identity. Reuse its owner when the visible design agrees,
  // instead of selecting the oldest duplicate and reporting a false conflict.
  if (owner && ownerDesignMatches && ownerSupplierMatches) {
    item = await tx.query.items.findFirst({
      where: and(eq(items.id, owner.itemId), isNull(items.deletedAt)),
      with: { articleNumbers: true },
    })
  }

  item ??= await tx.query.items.findFirst({
    where: and(
      isNull(items.deletedAt),
      sql`lower(${items.design}) = ${normalizedDesign}`,
      eq(items.supplierId, supplier.id),
    ),
    with: { articleNumbers: true },
    orderBy: [
      sql`case when ${items.supplierId} = ${supplier.id} then 0 else 1 end`,
      asc(items.createdAt),
      asc(items.id),
    ],
  })

  if (!item) {
    const minimumSellPriceUgx =
      normalizeMinimumSellPrice(line.minimumSellPriceUgx) ?? '0.00'
    const lowStockThreshold =
      normalizeLowStockThreshold(line.lowStockThreshold) ?? 0
    const [created] = await tx
      .insert(items)
      .values({
        name: itemName,
        design,
        supplierId: supplier.id,
        costPrice: line.unitPriceForeign,
        costCurrency: foreignCurrency,
        minimumSellPriceUgx,
        lowStockThreshold,
      })
      .returning()
    item = { ...created, articleNumbers: [] }
  }

  if (owner && owner.itemId !== item.id) {
    throw new Error(
      `Art number "${articleNumber}" already belongs to "${owner.item.design}" for supplier "${owner.item.supplier?.name ?? supplier.name}"`,
    )
  }
  if (!owner) {
    try {
      await tx.insert(itemArticleNumbers).values({
        itemId: item.id,
        articleNumber,
        qualifiedArticleNumber: qualified,
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const conflictingOwners = await tx.query.itemArticleNumbers.findMany({
        where: eq(itemArticleNumbers.qualifiedArticleNumber, qualified),
        with: {
          item: {
            columns: { name: true, design: true, supplierId: true },
            with: { supplier: { columns: { name: true } } },
          },
        },
      })
      const conflictingOwnerItemIds = new Set(
        conflictingOwners.map((entry) => entry.itemId),
      )
      if (conflictingOwnerItemIds.size > 1) {
        throw new Error(
          `Art number "${articleNumber}" has conflicting catalog ownership`,
        )
      }
      const conflictingOwner = conflictingOwners.at(0)
      if (conflictingOwner && conflictingOwner.itemId !== item.id) {
        throw new Error(
          `Art number "${articleNumber}" already belongs to "${conflictingOwner.item.design}"`,
        )
      }
    }
  }

  const minimumSellPriceUgx =
    normalizeMinimumSellPrice(line.minimumSellPriceUgx) ??
    item.minimumSellPriceUgx
  const lowStockThreshold =
    normalizeLowStockThreshold(line.lowStockThreshold) ??
    item.lowStockThreshold
  const defaults = {
    costPrice: new BigNumber(line.unitPriceForeign).toFixed(2),
    costCurrency: foreignCurrency,
    minimumSellPriceUgx,
    lowStockThreshold,
  }
  const previousDefaults = itemDefaults.get(item.id)
  if (
    previousDefaults &&
    JSON.stringify(previousDefaults) !== JSON.stringify(defaults)
  ) {
    throw new Error('Receipt contains conflicting defaults for the same item')
  }
  itemDefaults.set(item.id, defaults)
  await tx.update(items).set(defaults).where(eq(items.id, item.id))

  const materializedColorId = await materializeReceiptItemAttributes(
    tx,
    item.id,
    line,
  )

  return {
    itemId: item.id,
    articleNumber,
    colorId: materializedColorId,
    minimumSellPriceUgx,
    lowStockThreshold,
  }
}

async function getOpenRoute(id: string) {
  const route = await db.query.supplyRoutes.findFirst({
    where: eq(supplyRoutes.id, id),
  })
  if (!route) throw new Error('Supply route not found')
  if (route.status !== 'open') throw new Error('Only open routes can be edited')
  return route
}

async function getActiveSupplier(id: string) {
  const supplier = await db.query.suppliers.findFirst({
    where: and(eq(suppliers.id, id), isNull(suppliers.deletedAt)),
  })
  if (!supplier) throw new Error('Supplier not found')
  return supplier
}

/** Keeps legacy line mutations attached to a visible receipt. */
export async function ensureSupplyRouteReceipt(
  tx: ReceiptTransaction,
  input: {
    supplyRouteId: string
    supplierId: string
    sourceEntryId: string
    receiptDate?: string | null
    foreignCurrency: 'RMB' | 'USD' | 'UGX'
    exchangeRateForeignToUsd?: string | null
    exchangeRateUsdToUgx?: string | null
  },
) {
  const existing = await tx.query.supplyRouteReceipts.findFirst({
    where: and(
      eq(supplyRouteReceipts.supplyRouteId, input.supplyRouteId),
      eq(supplyRouteReceipts.supplierId, input.supplierId),
      eq(supplyRouteReceipts.sourceEntryId, input.sourceEntryId),
    ),
  })
  if (existing) {
    const receiptLines = await tx.query.supplyRouteLines.findMany({
      where: eq(supplyRouteLines.receiptId, existing.id),
      columns: { id: true },
    })
    if (receiptLines.length > 0) {
      const received = await tx.query.storeReceivings.findFirst({
        where: inArray(
          storeReceivings.supplyRouteLineId,
          receiptLines.map((line) => line.id),
        ),
      })
      if (received) throw new Error('Received receipts cannot be changed')
    }
    return existing.id
  }
  await tx
    .insert(supplyRouteReceipts)
    .values({
      supplyRouteId: input.supplyRouteId,
      supplierId: input.supplierId,
      sourceEntryId: input.sourceEntryId,
      receiptDate: input.receiptDate ?? null,
      foreignCurrency: input.foreignCurrency,
      exchangeRateForeignToUsd: input.exchangeRateForeignToUsd ?? null,
      exchangeRateUsdToUgx: input.exchangeRateUsdToUgx ?? null,
    })
    .onConflictDoNothing()
  const receipt = await tx.query.supplyRouteReceipts.findFirst({
    where: and(
      eq(supplyRouteReceipts.supplyRouteId, input.supplyRouteId),
      eq(supplyRouteReceipts.supplierId, input.supplierId),
      eq(supplyRouteReceipts.sourceEntryId, input.sourceEntryId),
    ),
  })
  if (!receipt) throw new Error('Could not create receipt')
  return receipt.id
}

async function materializeReceiptLines(
  tx: ReceiptTransaction,
  draft: ReceiptDraft,
  receiptId: string,
  route: typeof supplyRoutes.$inferSelect,
  supplier: typeof suppliers.$inferSelect,
) {
  const itemIds = Array.from(
    new Set(draft.lines.flatMap((line) => (line.itemId ? [line.itemId] : []))),
  )
  const colorIds = Array.from(
    new Set(
      draft.lines.flatMap((line) => (line.colorId ? [line.colorId] : [])),
    ),
  )
  const [catalogItems, colors] = await Promise.all([
    itemIds.length
      ? tx.query.items.findMany({
          where: inArray(items.id, itemIds),
          with: { articleNumbers: true },
        })
      : [],
    colorIds.length
      ? tx.query.itemColors.findMany({
          where: inArray(itemColors.id, colorIds),
          columns: { id: true, itemId: true, colorName: true, colorHex: true },
        })
      : [],
  ])
  const itemsById = new Map(catalogItems.map((item) => [item.id, item]))
  const colorsById = new Map(colors.map((color) => [color.id, color]))
  const foreignCurrency = draft.foreignCurrency
  const foreignRate =
    draft.exchangeRateForeignToUsd ??
    (foreignCurrency === 'RMB' ? (route.rateRmbPerUsd ?? undefined) : undefined)
  const ugxRate =
    draft.exchangeRateUsdToUgx ??
    (foreignCurrency !== 'UGX' ? (route.rateUgxPerUsd ?? undefined) : undefined)

  return draft.lines.map((line) => {
    const item = line.itemId ? itemsById.get(line.itemId) : undefined
    if (line.itemId && !item) throw new Error('Catalog design not found')
    const color = line.colorId ? colorsById.get(line.colorId) : undefined
    if (line.colorId && !color) throw new Error('Catalog colour not found')
    if (color && item && color.itemId !== item.id)
      throw new Error('Colour does not belong to the selected design')
    const amounts = calculateSupplyLineAmounts({
      quantity: line.quantity,
      unitPriceForeign: line.unitPriceForeign,
      foreignCurrency,
      exchangeRateForeignToUsd: foreignRate,
      exchangeRateUsdToUgx: ugxRate,
    })
    const articleNumber = line.articleNumber.trim()
    const colorText = line.colorText?.trim() || color?.colorName || null
    const sizes = normalizeReceiptSizes(line.size?.trim() ?? '')
    return {
      supplyRouteId: draft.supplyRouteId,
      receiptId,
      entryId: crypto.randomUUID(),
      supplierId: supplier.id,
      itemId: item?.id ?? null,
      colorId: color?.id ?? null,
      size: sizes.length === 1 ? sizes[0] : null,
      sizeTextSnapshot: line.size?.trim() || null,
      supplierNameSnapshot: supplier.name,
      articleNumberSnapshot: articleNumber,
      itemNameSnapshot:
        line.itemName?.trim() || item?.name || line.design.trim(),
      colorNameSnapshot: color?.colorName ?? colorText,
      designSnapshot: line.design.trim(),
      colorTextSnapshot: colorText,
      colorHexSnapshot: line.colorHex ?? color?.colorHex ?? null,
      quantity: line.quantity,
      unitPriceForeign: line.unitPriceForeign,
      foreignCurrency,
      exchangeRateForeignToUsd: foreignRate,
      exchangeRateUsdToUgx: ugxRate,
      ...amounts,
      minimumSellPriceUgx:
        line.minimumSellPriceUgx ?? item?.minimumSellPriceUgx ?? '0',
      lowStockThreshold: line.lowStockThreshold ?? item?.lowStockThreshold ?? 0,
    }
  })
}

async function assertReceiptEditable(
  tx: ReceiptTransaction,
  receiptId: string,
) {
  const receipt = await tx.query.supplyRouteReceipts.findFirst({
    where: eq(supplyRouteReceipts.id, receiptId),
    with: { supplyRoute: true, lines: true },
  })
  if (!receipt) throw new Error('Supply receipt not found')
  if (receipt.supplyRoute.status !== 'open')
    throw new Error('Only open routes can be edited')
  if (receipt.lines.length > 0) {
    const received = await tx.query.storeReceivings.findFirst({
      where: inArray(
        storeReceivings.supplyRouteLineId,
        receipt.lines.map((line) => line.id),
      ),
    })
    if (received) throw new Error('Received receipt lines cannot be replaced')
  }
  return receipt
}

export async function createSupplyRouteReceiptServer(data: ReceiptDraft) {
  await requireSessionAndRole(['admin'])
  const route = await getOpenRoute(data.supplyRouteId)
  const supplier = await getActiveSupplier(data.supplierId)
  return db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(supplyRouteReceipts)
      .values({
        supplyRouteId: route.id,
        supplierId: supplier.id,
        receiptDate: data.receiptDate,
        reference: data.reference || null,
        notes: data.notes || null,
        foreignCurrency: data.foreignCurrency,
        exchangeRateForeignToUsd:
          data.foreignCurrency === 'RMB'
            ? (data.exchangeRateForeignToUsd ?? route.rateRmbPerUsd)
            : null,
        exchangeRateUsdToUgx:
          data.foreignCurrency !== 'UGX'
            ? (data.exchangeRateUsdToUgx ?? route.rateUgxPerUsd)
            : null,
      })
      .returning()
    const resolvedLines = []
    const itemDefaults = new Map<
      string,
      {
        costPrice: string
        costCurrency: string
        minimumSellPriceUgx: string
        lowStockThreshold: number
      }
    >()
    for (const line of data.lines) {
      const resolved = await resolveReceiptLineItem(
        tx,
        line,
        supplier,
        data.foreignCurrency,
        itemDefaults,
      )
      resolvedLines.push({ ...line, ...resolved })
    }
    const lines = await materializeReceiptLines(
      tx,
      { ...data, lines: resolvedLines },
      receipt.id,
      route,
      supplier,
    )
    const savedLines = await tx
      .insert(supplyRouteLines)
      .values(lines)
      .returning()
    return { receipt, lines: savedLines }
  })
}

export async function replaceSupplyRouteReceiptServer(
  data: ReceiptDraft & { receiptId: string },
) {
  await requireSessionAndRole(['admin'])
  const route = await getOpenRoute(data.supplyRouteId)
  const supplier = await getActiveSupplier(data.supplierId)
  return db.transaction(async (tx) => {
    const existing = await assertReceiptEditable(tx, data.receiptId)
    if (existing.supplyRouteId !== route.id)
      throw new Error('Receipt does not belong to this route')
    await tx
      .update(supplyRouteReceipts)
      .set({
        supplierId: supplier.id,
        receiptDate: data.receiptDate,
        reference: data.reference || null,
        notes: data.notes || null,
        foreignCurrency: data.foreignCurrency,
        exchangeRateForeignToUsd:
          data.foreignCurrency === 'RMB'
            ? (data.exchangeRateForeignToUsd ?? route.rateRmbPerUsd)
            : null,
        exchangeRateUsdToUgx:
          data.foreignCurrency !== 'UGX'
            ? (data.exchangeRateUsdToUgx ?? route.rateUgxPerUsd)
            : null,
      })
      .where(eq(supplyRouteReceipts.id, data.receiptId))
    await tx
      .delete(supplyRouteLines)
      .where(eq(supplyRouteLines.receiptId, data.receiptId))
    const resolvedLines = []
    const itemDefaults = new Map<
      string,
      {
        costPrice: string
        costCurrency: string
        minimumSellPriceUgx: string
        lowStockThreshold: number
      }
    >()
    for (const line of data.lines) {
      const resolved = await resolveReceiptLineItem(
        tx,
        line,
        supplier,
        data.foreignCurrency,
        itemDefaults,
      )
      resolvedLines.push({ ...line, ...resolved })
    }
    const lines = await materializeReceiptLines(
      tx,
      { ...data, lines: resolvedLines },
      data.receiptId,
      route,
      supplier,
    )
    const savedLines = await tx
      .insert(supplyRouteLines)
      .values(lines)
      .returning()
    return {
      receipt: { ...existing, supplierId: supplier.id },
      lines: savedLines,
    }
  })
}

export async function deleteSupplyRouteReceiptServer(data: {
  supplyRouteId: string
  receiptId: string
}) {
  await requireSessionAndRole(['admin'])
  await getOpenRoute(data.supplyRouteId)
  return db.transaction(async (tx) => {
    const receipt = await assertReceiptEditable(tx, data.receiptId)
    if (receipt.supplyRouteId !== data.supplyRouteId)
      throw new Error('Receipt does not belong to this route')
    await tx
      .delete(supplyRouteReceipts)
      .where(eq(supplyRouteReceipts.id, data.receiptId))
    return { id: data.receiptId }
  })
}
