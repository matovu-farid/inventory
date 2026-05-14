import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { storeStock, shopStock, shops } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { validateOpeningBalanceCell } from "./opening-balance-validate"

const cellSchema = z.object({
  productColorId: z.uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
})

const productEntry = z.object({
  productId: z.uuid(),
  unitCostUgx: z.string().min(1),
  cells: z.array(cellSchema).min(1),
})

const storeOpeningInput = z.object({ items: z.array(productEntry).min(1) })
const shopOpeningInput = z.object({
  shopId: z.uuid(),
  items: z.array(productEntry).min(1),
})

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
      const createdIds: string[] = []
      let totalValue = new BigNumber(0)

      for (const entry of data.items) {
        const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
        let entryValue = new BigNumber(0)
        const entryRowIds: string[] = []

        for (const cell of entry.cells) {
          const [row] = await tx
            .insert(storeStock)
            .values({
              storeId: store.id,
              productColorId: cell.productColorId,
              size: cell.size,
              supplyRouteItemId: null,
              quantityOnHand: cell.quantity,
              costPerUnitUgx: cost.toFixed(2),
              minimumSellPriceUgx: cost.toFixed(2),
            })
            .returning()
          entryRowIds.push(row.id)
          createdIds.push(row.id)
          entryValue = entryValue.plus(cost.times(cell.quantity))
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
          description: `Opening balance: ${entry.cells.length} variants of product ${entry.productId}`,
        })

        totalValue = totalValue.plus(entryValue)
      }

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.store",
        entityType: "store_stock",
        entityId: createdIds[0],
        metadata: {
          itemCount: createdIds.length,
          totalValueUgx: totalValue.toFixed(2),
          stockIds: createdIds,
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
      const createdIds: string[] = []
      let totalValue = new BigNumber(0)

      for (const entry of data.items) {
        const cost = new BigNumber(entry.unitCostUgx).dp(2, BigNumber.ROUND_HALF_UP)
        let entryValue = new BigNumber(0)
        const entryRowIds: string[] = []

        for (const cell of entry.cells) {
          const [row] = await tx
            .insert(shopStock)
            .values({
              shopId: shop.id,
              productColorId: cell.productColorId,
              size: cell.size,
              storeTransferItemId: null,
              quantityOnHand: cell.quantity,
              costPerUnitUgx: cost.toFixed(2),
              minimumSellPriceUgx: cost.toFixed(2),
            })
            .returning()
          entryRowIds.push(row.id)
          createdIds.push(row.id)
          entryValue = entryValue.plus(cost.times(cell.quantity))
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
          description: `Opening balance: ${entry.cells.length} variants of product ${entry.productId}`,
        })

        totalValue = totalValue.plus(entryValue)
      }

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.shop",
        entityType: "shop_stock",
        entityId: createdIds[0],
        metadata: {
          shopId: shop.id,
          itemCount: createdIds.length,
          totalValueUgx: totalValue.toFixed(2),
          stockIds: createdIds,
        },
      })

      return {
        itemCount: createdIds.length,
        totalValueUgx: totalValue.toFixed(2),
        stockIds: createdIds,
      }
    })
  })
