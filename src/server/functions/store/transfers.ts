import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  storeTransfers,
  storeTransferLines,
  storeStock,
  shopStock,
  shops,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatItemLabel } from "#/lib/items"
import { renderAuditDescription } from "#/server/audit/descriptions"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { getActorName } from "#/server/audit/actor"
import {
  validateDiscrepancyNotes,
  validateQuantityReceived,
} from "./receive-validate"
import { buildTransferInventoryEntries } from "./transfer-entries"

export const listTransfers = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  return db.query.storeTransfers.findMany({
    orderBy: (t, { desc }) => [desc(t.transferDate)],
    with: {
      shop: true,
      items: {
        with: {
          storeStockItem: {
            with: { variant: { with: { color: { with: { item: true } } } } },
          },
        },
      },
    },
  })
})

const transferItemInput = z.object({
  storeStockId: z.uuid(),
  quantityDispatched: z.number().int().positive(),
  /** Min sell price the shop must charge for this item. Optional;
   *  falls back to the store's cost-per-unit when omitted. */
  minimumSellPriceUgx: z.string().optional(),
})

const createTransferInput = z.object({
  shopId: z.uuid(),
  notes: z.string().optional(),
  items: z.array(transferItemInput).min(1),
})

/**
 * Create and dispatch a transfer from store to a shop.
 *
 * 1. Validates stock availability
 * 2. Decrements store stock
 * 3. Creates transfer + transfer items at the minimum sell price
 * 4. Posts compound ledger entries:
 *    DR Inventory-Shop (transfer price)   / CR Inventory-Store (cost)
 *                                         / CR Store Transfer Revenue (margin)
 *    DR Due from Shop (transfer price)    / CR Due to Store (transfer price)
 */
export const createTransfer = createServerFn()
  .inputValidator(createTransferInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      // Create transfer header
      const [transfer] = await tx
        .insert(storeTransfers)
        .values({
          storeId: store.id,
          shopId: data.shopId,
          transferDate: new Date(),
          status: "dispatched",
          dispatchedBy: userId,
          notes: data.notes,
        })
        .returning()

      let totalTransferValue = new BigNumber(0)
      let totalCostValue = new BigNumber(0)

      for (const item of data.items) {
        // Validate stock
        const stock = await tx.query.storeStock.findFirst({
          where: eq(storeStock.id, item.storeStockId),
          with: { variant: { with: { color: { with: { item: true } } } } },
        })
        if (!stock) throw new Error(`Store stock not found: ${item.storeStockId}`)
        const itemLabel = formatItemLabel(
          stock.variant.color.item.articleNumber,
          stock.variant.color.colorName,
          stock.variant.size,
        )
        if (stock.quantityOnHand < item.quantityDispatched) {
          throw new Error(`Insufficient stock for ${itemLabel}: have ${stock.quantityOnHand}, need ${item.quantityDispatched}`)
        }

        const unitPrice = new BigNumber(stock.minimumSellPriceUgx)
        const totalPrice = unitPrice.times(item.quantityDispatched)
        const itemCost = new BigNumber(stock.costPerUnitUgx).times(item.quantityDispatched)

        // Shop's minimum sell price defaults to the store's cost-per-unit
        // when the dispatcher doesn't override it.
        const shopMinSellRaw =
          item.minimumSellPriceUgx && item.minimumSellPriceUgx.trim().length > 0
            ? item.minimumSellPriceUgx
            : stock.costPerUnitUgx
        const shopMinSell = new BigNumber(shopMinSellRaw)
        if (!shopMinSell.isFinite() || shopMinSell.lte(0)) {
          throw new Error(
            `Invalid shop minimum sell price for ${itemLabel}`,
          )
        }

        // Create transfer item
        await tx.insert(storeTransferLines).values({
          storeTransferId: transfer.id,
          storeStockId: item.storeStockId,
          quantityDispatched: item.quantityDispatched,
          unitPriceUgx: unitPrice.toFixed(2),
          totalPriceUgx: totalPrice.toFixed(2),
          minimumSellPriceUgx: shopMinSell.toFixed(2),
        })

        // Decrement store stock
        await tx
          .update(storeStock)
          .set({
            quantityOnHand: sql`${storeStock.quantityOnHand} - ${item.quantityDispatched}`,
          })
          .where(eq(storeStock.id, item.storeStockId))

        totalTransferValue = totalTransferValue.plus(totalPrice)
        totalCostValue = totalCostValue.plus(itemCost)
      }

      // Ledger: inventory movement (always balanced via the helper)
      const { entries: inventoryEntries } = buildTransferInventoryEntries({
        totalTransferValue: totalTransferValue.toFixed(2),
        totalCostValue: totalCostValue.toFixed(2),
      })

      await postJournalEntry(tx, {
        entries: inventoryEntries,
        referenceType: "store_transfer",
        referenceId: transfer.id,
        locationType: "store",
        locationId: store.id,
        recordedBy: userId,
        description: `Transfer to shop`,
      })

      // Ledger: inter-branch balance
      // DR Due from Shop / CR Due to Store
      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: "Due from Shop", amount: totalTransferValue.toFixed(2) },
          { type: "credit", category: "Due to Store", amount: totalTransferValue.toFixed(2) },
        ],
        referenceType: "store_transfer",
        referenceId: transfer.id,
        locationType: "store",
        locationId: store.id,
        recordedBy: userId,
        description: `Inter-branch balance for transfer`,
      })

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, data.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: "transfer.create",
        entityType: "store_transfer",
        entityId: transfer.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "transfer.create",
        entityType: "store_transfer",
        entityId: transfer.id,
        description: renderAuditDescription("transfer.create", {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        after: {
          shopId: data.shopId,
          status: "dispatched",
          notes: data.notes,
        },
        metadata: {
          itemCount: data.items.length,
          totalTransferValueUgx: totalTransferValue.toFixed(2),
          totalCostValueUgx: totalCostValue.toFixed(2),
        },
      })

      return transfer
    })
  })

/**
 * Confirm receipt of a transfer at the shop side.
 * Creates ShopStock entries and detects distribution loss.
 */
const confirmReceiptInput = z.object({
  transferId: z.uuid(),
  items: z.array(
    z.object({
      transferItemId: z.uuid(),
      quantityReceived: z.number().int().min(0),
      discrepancyNotes: z.string().optional(),
    }),
  ),
})

export const confirmTransferReceipt = createServerFn()
  .inputValidator(confirmReceiptInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const transfer = await tx.query.storeTransfers.findFirst({
        where: eq(storeTransfers.id, data.transferId),
        with: {
          items: {
            with: {
              storeStockItem: {
                with: { variant: { with: { color: { with: { item: true } } } } },
              },
            },
          },
        },
      })
      if (!transfer) throw new Error("Transfer not found")
      if (transfer.status !== "dispatched") {
        throw new Error(`Transfer is ${transfer.status}, expected dispatched`)
      }

      const store = await tx.query.stores.findFirst()
      if (!store) throw new Error("Store not configured")

      for (const receiptItem of data.items) {
        const ti = transfer.items.find((i) => i.id === receiptItem.transferItemId)
        if (!ti) throw new Error(`Transfer item not found: ${receiptItem.transferItemId}`)

        // Idempotency guard — aggregate ON CONFLICT means we can't safely re-apply
        if (ti.quantityReceived !== null) {
          throw new Error("This transfer item has already been received. Use a return flow to adjust.")
        }

        const itemLabel = formatItemLabel(
          ti.storeStockItem.variant.color.item.articleNumber,
          ti.storeStockItem.variant.color.colorName,
          ti.storeStockItem.variant.size,
        )

        validateQuantityReceived(receiptItem.quantityReceived)
        validateDiscrepancyNotes({
          quantityExpected: ti.quantityDispatched,
          quantityReceived: receiptItem.quantityReceived,
          discrepancyNotes: receiptItem.discrepancyNotes,
        })

        await tx
          .update(storeTransferLines)
          .set({
            quantityReceived: receiptItem.quantityReceived,
            discrepancyNotes: receiptItem.discrepancyNotes,
          })
          .where(eq(storeTransferLines.id, ti.id))

        // Upsert shop stock — merge into existing (shopId, variantId) row.
        // The unique constraint forces aggregation across multiple transfers.
        if (receiptItem.quantityReceived > 0) {
          await tx
            .insert(shopStock)
            .values({
              shopId: transfer.shopId,
              variantId: ti.storeStockItem.variantId,
              storeTransferItemId: ti.id,
              quantityOnHand: receiptItem.quantityReceived,
              costPerUnitUgx: ti.unitPriceUgx,
              // Honor the shop min sell price set at dispatch.
              // Legacy rows (pre-feature) fall back to the transfer price.
              minimumSellPriceUgx: ti.minimumSellPriceUgx ?? ti.unitPriceUgx,
            })
            .onConflictDoUpdate({
              target: [shopStock.shopId, shopStock.variantId],
              set: {
                quantityOnHand: sql`${shopStock.quantityOnHand} + ${receiptItem.quantityReceived}`,
              },
            })
        }

        // Distribution loss: items dispatched but never arrived at the shop.
        const loss = ti.quantityDispatched - receiptItem.quantityReceived
        if (loss > 0) {
          const lossValue = new BigNumber(ti.unitPriceUgx).times(loss)
          await postJournalEntry(tx, {
            entries: [
              { type: "debit", category: "Inventory Loss", amount: lossValue.toFixed(2) },
              { type: "credit", category: "Inventory - Shop", amount: lossValue.toFixed(2) },
            ],
            referenceType: "distribution_loss",
            referenceId: ti.id,
            locationType: "shop",
            locationId: transfer.shopId,
            recordedBy: userId,
            description: `Distribution loss: ${loss}× ${itemLabel}`,
          })
        }
      }

      // Update transfer status
      await tx
        .update(storeTransfers)
        .set({ status: "received", receivedBy: userId })
        .where(eq(storeTransfers.id, data.transferId))

      const totalLoss = data.items.reduce((sum, i) => {
        const ti = transfer.items.find((x) => x.id === i.transferItemId)
        if (!ti) return sum
        return sum + (ti.quantityDispatched - i.quantityReceived)
      }, 0)

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, transfer.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: "transfer.receive",
        entityType: "store_transfer",
        entityId: data.transferId,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "transfer.receive",
        entityType: "store_transfer",
        entityId: data.transferId,
        description: renderAuditDescription("transfer.receive", {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        before: { status: "dispatched" },
        after: { status: "received" },
        metadata: {
          itemCount: data.items.length,
          shopId: transfer.shopId,
          totalDistributionLoss: totalLoss,
        },
      })

      return { transferId: data.transferId, status: "received" }
    })
  })
