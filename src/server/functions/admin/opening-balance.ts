import { createServerFn } from "@tanstack/react-start"
import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  itemColors,
  shopStock,
  shops,
  storeStock,
  variants,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { validateOpeningBalanceCell } from "./opening-balance-validate"
import { renderAuditDescription } from "#/server/audit/descriptions"
import { getActorName } from "#/server/audit/actor"

// Opening balance cells now address inventory by `variant_id` directly
// (the variant is the unit of stock since #4 / #5 / #6). Operators pick a
// variant from a dropdown that lists pre-materialised (color, size) pairs
// — the server no longer reaches for one by (color, size) on the fly.
const cellSchema = z.object({
  variantId: z.uuid(),
  quantity: z.number().int().positive(),
})

const itemEntry = z.object({
  itemId: z.uuid(),
  unitCostUgx: z.string().min(1),
  cells: z.array(cellSchema).min(1),
})

const storeOpeningInput = z.object({ items: z.array(itemEntry).min(1) })
const shopOpeningInput = z.object({
  shopId: z.uuid(),
  items: z.array(itemEntry).min(1),
})

type CellInput = z.infer<typeof cellSchema>

interface ResolvedVariant {
  variantId: string
  colorName: string
  size: string
}

/**
 * Resolve a set of cell variantIds to their (colorName, size) breakdown so
 * we can:
 *   - sanity-check that every referenced variant exists,
 *   - emit a self-describing audit payload that doesn't depend on the
 *     variant row still existing later.
 */
async function resolveVariantContext(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  cells: CellInput[],
): Promise<Map<string, ResolvedVariant>> {
  const ids = Array.from(new Set(cells.map((c) => c.variantId)))
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
    const missing = ids.filter(
      (id) => !rows.some((r) => r.variantId === id),
    )
    throw new Error(
      `Variant(s) not found: ${missing.join(
        ", ",
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

export const addStoreOpeningBalance = createServerFn()
  .inputValidator(storeOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    // Validate before opening a transaction.
    for (const entry of data.items) {
      for (const cell of entry.cells) {
        validateOpeningBalanceCell(cell, entry.unitCostUgx)
      }
    }

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const allCells = data.items.flatMap((e) => e.cells)
      const variantById = await resolveVariantContext(tx, allCells)

      const createdIds: string[] = []
      let totalValue = new BigNumber(0)
      const auditLines: Array<{
        variantId: string
        colorName: string
        size: string
        quantity: number
      }> = []

      for (const entry of data.items) {
        const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
        let entryValue = new BigNumber(0)
        const entryRowIds: string[] = []

        for (const cell of entry.cells) {
          const ctx = variantById.get(cell.variantId)
          if (!ctx) {
            // Defensive — resolveVariantContext already throws when a
            // variant is missing, but keep a narrow guard so TS knows
            // `ctx` is defined on the audit-line push below.
            throw new Error(`Variant ${cell.variantId} not resolved`)
          }
          const [row] = await tx
            .insert(storeStock)
            .values({
              storeId: store.id,
              variantId: cell.variantId,
              supplyRouteLineId: null,
              quantityOnHand: cell.quantity,
              costPerUnitUgx: cost.toFixed(2),
              minimumSellPriceUgx: cost.toFixed(2),
            })
            .returning()
          entryRowIds.push(row.id)
          createdIds.push(row.id)
          entryValue = entryValue.plus(cost.times(cell.quantity))
          auditLines.push({
            variantId: cell.variantId,
            colorName: ctx.colorName,
            size: ctx.size,
            quantity: cell.quantity,
          })
        }

        await postJournalEntry(tx, {
          entries: [
            { type: "debit",  category: "Inventory - Store", amount: entryValue.toFixed(2) },
            { type: "credit", category: "Owner's Equity",     amount: entryValue.toFixed(2) },
          ],
          referenceType: "opening_balance",
          referenceId: entryRowIds[0],
          locationType: "store",
          locationId: store.id,
          recordedBy: userId,
          description: `Opening balance: ${entry.cells.length} variants of item ${entry.itemId}`,
        })

        totalValue = totalValue.plus(entryValue)
      }

      const actorName = await getActorName(tx, userId)

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.store",
        entityType: "store_stock",
        entityId: createdIds[0],
        description: renderAuditDescription("openingBalance.store", {
          actorName,
          itemCount: data.items.length,
        }),
        articleNumbers: [],
        metadata: {
          itemCount: createdIds.length,
          totalValueUgx: totalValue.toFixed(2),
          stockIds: createdIds,
          // (colorName, size) for each variant landed — keeps the audit row
          // self-describing once the variant row is no longer reachable.
          lines: auditLines,
        },
      })

      return {
        itemCount: createdIds.length,
        totalValueUgx: totalValue.toFixed(2),
        stockIds: createdIds,
      }
    })
  })

export const addShopOpeningBalance = createServerFn()
  .inputValidator(shopOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    for (const entry of data.items) {
      for (const cell of entry.cells) {
        validateOpeningBalanceCell(cell, entry.unitCostUgx)
      }
    }

    const shop = await db.query.shops.findFirst({ where: eq(shops.id, data.shopId) })
    if (!shop) throw new Error(`Shop not found: ${data.shopId}`)

    return db.transaction(async (tx) => {
      const allCells = data.items.flatMap((e) => e.cells)
      const variantById = await resolveVariantContext(tx, allCells)

      const createdIds: string[] = []
      let totalValue = new BigNumber(0)
      const auditLines: Array<{
        variantId: string
        colorName: string
        size: string
        quantity: number
      }> = []

      for (const entry of data.items) {
        const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
        let entryValue = new BigNumber(0)
        const entryRowIds: string[] = []

        for (const cell of entry.cells) {
          const ctx = variantById.get(cell.variantId)
          if (!ctx) {
            throw new Error(`Variant ${cell.variantId} not resolved`)
          }
          const [row] = await tx
            .insert(shopStock)
            .values({
              shopId: shop.id,
              variantId: cell.variantId,
              storeTransferItemId: null,
              quantityOnHand: cell.quantity,
              costPerUnitUgx: cost.toFixed(2),
              minimumSellPriceUgx: cost.toFixed(2),
            })
            .returning()
          entryRowIds.push(row.id)
          createdIds.push(row.id)
          entryValue = entryValue.plus(cost.times(cell.quantity))
          auditLines.push({
            variantId: cell.variantId,
            colorName: ctx.colorName,
            size: ctx.size,
            quantity: cell.quantity,
          })
        }

        await postJournalEntry(tx, {
          entries: [
            { type: "debit",  category: "Inventory - Shop", amount: entryValue.toFixed(2) },
            { type: "credit", category: "Owner's Equity",    amount: entryValue.toFixed(2) },
          ],
          referenceType: "opening_balance",
          referenceId: entryRowIds[0],
          locationType: "shop",
          locationId: shop.id,
          recordedBy: userId,
          description: `Opening balance: ${entry.cells.length} variants of item ${entry.itemId}`,
        })

        totalValue = totalValue.plus(entryValue)
      }

      const actorName = await getActorName(tx, userId)

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.shop",
        entityType: "shop_stock",
        entityId: createdIds[0],
        description: renderAuditDescription("openingBalance.shop", {
          actorName,
          shopName: shop.name,
          itemCount: data.items.length,
        }),
        articleNumbers: [],
        metadata: {
          shopId: shop.id,
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
    })
  })
