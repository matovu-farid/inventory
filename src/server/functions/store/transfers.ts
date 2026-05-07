import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  storeTransfers,
  storeTransferItems,
  storeStock,
  shopStock,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { buildTransferInventoryEntries } from "./transfer-entries"

export const listTransfers = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  return db.query.storeTransfers.findMany({
    orderBy: (t, { desc }) => [desc(t.transferDate)],
    with: {
      shop: true,
      items: true,
    },
  })
})

const transferItemInput = z.object({
  storeStockId: z.string().uuid(),
  quantityDispatched: z.number().int().positive(),
})

const createTransferInput = z.object({
  shopId: z.string().uuid(),
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
    const userId = (session.user as { id: string }).id

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
        })
        if (!stock) throw new Error(`Store stock not found: ${item.storeStockId}`)
        if (stock.quantityOnHand < item.quantityDispatched) {
          throw new Error(`Insufficient stock for ${stock.productName}: have ${stock.quantityOnHand}, need ${item.quantityDispatched}`)
        }

        const unitPrice = new BigNumber(stock.minimumSellPriceUgx)
        const totalPrice = unitPrice.times(item.quantityDispatched)
        const itemCost = new BigNumber(stock.costPerUnitUgx).times(item.quantityDispatched)

        // Create transfer item
        await tx.insert(storeTransferItems).values({
          storeTransferId: transfer.id,
          storeStockId: item.storeStockId,
          productName: stock.productName,
          quantityDispatched: item.quantityDispatched,
          unitPriceUgx: unitPrice.toFixed(2),
          totalPriceUgx: totalPrice.toFixed(2),
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

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "transfer.create",
        entityType: "store_transfer",
        entityId: transfer.id,
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
  transferId: z.string().uuid(),
  items: z.array(
    z.object({
      transferItemId: z.string().uuid(),
      quantityReceived: z.number().int().min(0),
    }),
  ),
})

export const confirmTransferReceipt = createServerFn()
  .inputValidator(confirmReceiptInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      const transfer = await tx.query.storeTransfers.findFirst({
        where: eq(storeTransfers.id, data.transferId),
        with: { items: true },
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

        // Update transfer item with received quantity
        await tx
          .update(storeTransferItems)
          .set({ quantityReceived: receiptItem.quantityReceived })
          .where(eq(storeTransferItems.id, ti.id))

        // Create or update shop stock (idempotent for re-calls)
        const existingShopStock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.storeTransferItemId, ti.id),
        })
        if (existingShopStock) {
          await tx
            .update(shopStock)
            .set({ quantityOnHand: receiptItem.quantityReceived })
            .where(eq(shopStock.id, existingShopStock.id))
        } else {
          await tx.insert(shopStock).values({
            shopId: transfer.shopId,
            productName: ti.productName,
            storeTransferItemId: ti.id,
            quantityOnHand: receiptItem.quantityReceived,
            costPerUnitUgx: ti.unitPriceUgx,
            minimumSellPriceUgx: ti.unitPriceUgx,
          })
        }

        // Detect distribution loss
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
            description: `Distribution loss: ${loss}x ${ti.productName}`,
          })
        }
      }

      // Update transfer status
      await tx
        .update(storeTransfers)
        .set({ status: "received", receivedBy: userId })
        .where(eq(storeTransfers.id, data.transferId))

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "transfer.receive",
        entityType: "store_transfer",
        entityId: data.transferId,
        before: { status: "dispatched" },
        after: { status: "received" },
        metadata: {
          itemCount: data.items.length,
          shopId: transfer.shopId,
        },
      })

      return { transferId: data.transferId, status: "received" }
    })
  })
