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
import { validateOpeningBalanceItem } from "./opening-balance-validate"

// ── Zod schemas ───────────────────────────────────────────────────

const itemInput = z.object({
  productName: z.string().min(1),
  articleNumber: z.string().optional(),
  quantity: z.number().int().positive(),
  costPerUnitUgx: z.string().min(1),
})

const storeOpeningInput = z.object({
  items: z.array(itemInput).min(1),
})

const shopOpeningInput = z.object({
  shopId: z.string().uuid(),
  items: z.array(itemInput).min(1),
})

// ── Server functions ──────────────────────────────────────────────

/**
 * Seed StoreStock with opening-balance items. For each item, posts:
 *   DR Inventory - Store / CR Owner's Equity
 * referenceType = "opening_balance", referenceId = the new stock row's id.
 */
export const addStoreOpeningBalance = createServerFn()
  .inputValidator(storeOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    // Validate up-front so we fail before opening a transaction.
    data.items.forEach((item, idx) => validateOpeningBalanceItem(item, idx))

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const createdIds: string[] = []
      let totalValue = new BigNumber(0)

      for (const item of data.items) {
        const cost = new BigNumber(item.costPerUnitUgx).dp(
          2,
          BigNumber.ROUND_HALF_UP,
        )
        const lineValue = cost.times(item.quantity)

        const [row] = await tx
          .insert(storeStock)
          .values({
            storeId: store.id,
            productName: item.productName,
            articleNumber: item.articleNumber,
            // Nullable for opening balances — no originating supply route.
            supplyRouteItemId: null,
            quantityOnHand: item.quantity,
            costPerUnitUgx: cost.toFixed(2),
            // Default minimum sell price to cost; admin can adjust later.
            minimumSellPriceUgx: cost.toFixed(2),
          })
          .returning()

        await postJournalEntry(tx, {
          entries: [
            {
              type: "debit",
              category: "Inventory - Store",
              amount: lineValue.toFixed(2),
            },
            {
              type: "credit",
              category: "Owner's Equity",
              amount: lineValue.toFixed(2),
            },
          ],
          referenceType: "opening_balance",
          referenceId: row.id,
          locationType: "store",
          locationId: store.id,
          recordedBy: userId,
          description: `Opening balance: ${item.quantity}x ${item.productName}`,
        })

        createdIds.push(row.id)
        totalValue = totalValue.plus(lineValue)
      }

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.store",
        entityType: "store_stock",
        entityId: createdIds[0],
        metadata: {
          itemCount: data.items.length,
          totalValueUgx: totalValue.toFixed(2),
          stockIds: createdIds,
        },
      })

      return {
        itemCount: data.items.length,
        totalValueUgx: totalValue.toFixed(2),
        stockIds: createdIds,
      }
    })
  })

/**
 * Seed ShopStock with opening-balance items. For each item, posts:
 *   DR Inventory - Shop / CR Owner's Equity
 * referenceType = "opening_balance", referenceId = the new stock row's id.
 */
export const addShopOpeningBalance = createServerFn()
  .inputValidator(shopOpeningInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    data.items.forEach((item, idx) => validateOpeningBalanceItem(item, idx))

    const shop = await db.query.shops.findFirst({
      where: eq(shops.id, data.shopId),
    })
    if (!shop) throw new Error(`Shop not found: ${data.shopId}`)

    return db.transaction(async (tx) => {
      const createdIds: string[] = []
      let totalValue = new BigNumber(0)

      for (const item of data.items) {
        const cost = new BigNumber(item.costPerUnitUgx).dp(
          2,
          BigNumber.ROUND_HALF_UP,
        )
        const lineValue = cost.times(item.quantity)

        const [row] = await tx
          .insert(shopStock)
          .values({
            shopId: shop.id,
            productName: item.productName,
            articleNumber: item.articleNumber,
            // Nullable for opening balances — no originating transfer.
            storeTransferItemId: null,
            quantityOnHand: item.quantity,
            costPerUnitUgx: cost.toFixed(2),
            minimumSellPriceUgx: cost.toFixed(2),
          })
          .returning()

        await postJournalEntry(tx, {
          entries: [
            {
              type: "debit",
              category: "Inventory - Shop",
              amount: lineValue.toFixed(2),
            },
            {
              type: "credit",
              category: "Owner's Equity",
              amount: lineValue.toFixed(2),
            },
          ],
          referenceType: "opening_balance",
          referenceId: row.id,
          locationType: "shop",
          locationId: shop.id,
          recordedBy: userId,
          description: `Opening balance: ${item.quantity}x ${item.productName}`,
        })

        createdIds.push(row.id)
        totalValue = totalValue.plus(lineValue)
      }

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "openingBalance.shop",
        entityType: "shop_stock",
        entityId: createdIds[0],
        metadata: {
          shopId: shop.id,
          itemCount: data.items.length,
          totalValueUgx: totalValue.toFixed(2),
          stockIds: createdIds,
        },
      })

      return {
        itemCount: data.items.length,
        totalValueUgx: totalValue.toFixed(2),
        stockIds: createdIds,
      }
    })
  })
