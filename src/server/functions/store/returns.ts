import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  storeReturns,
  storeReturnItems,
  shopStock,
  storeStock,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { nextDocumentNumber } from "#/lib/document-numbers-db"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const returnItemInput = z.object({
  shopStockId: z.string().uuid(),
  quantityDispatched: z.number().int().positive(),
  unitTransferPriceUgx: z.string(),
  condition: z.enum(["resellable", "damaged"]),
})

const dispatchStoreReturnInput = z.object({
  shopId: z.string().uuid(),
  storeId: z.string().uuid(),
  originalTransferId: z.string().uuid().optional(),
  reason: z.string().min(1),
  items: z.array(returnItemInput).min(1),
  notes: z.string().optional(),
})

/**
 * Shop dispatches goods back to the store. Decrements shop stock immediately;
 * journal entries are deferred to the receipt step (since goods are
 * "in transit" until the store confirms).
 */
export const dispatchStoreReturn = createServerFn()
  .inputValidator(dispatchStoreReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      const itemDetails = []
      for (const item of data.items) {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, item.shopStockId),
        })
        if (!stock) throw new Error(`Stock item not found: ${item.shopStockId}`)
        if (stock.quantityOnHand < item.quantityDispatched) {
          throw new Error(
            `Insufficient stock for ${stock.productName}: have ${stock.quantityOnHand}, need ${item.quantityDispatched}`,
          )
        }
        itemDetails.push({ stock, ...item })
      }

      const docNumber = await nextDocumentNumber(tx, "STR-RET")
      const [storeReturn] = await tx
        .insert(storeReturns)
        .values({
          shopId: data.shopId,
          storeId: data.storeId,
          originalTransferId: data.originalTransferId,
          returnDate: new Date(),
          reason: data.reason,
          status: "dispatched",
          dispatchedBy: userId,
          approvedBy: userId,
          documentNumber: docNumber.formatted,
          notes: data.notes,
        })
        .returning()

      for (const detail of itemDetails) {
        await tx.insert(storeReturnItems).values({
          storeReturnId: storeReturn.id,
          shopStockId: detail.stock.id,
          productName: detail.stock.productName,
          quantityDispatched: detail.quantityDispatched,
          unitTransferPriceUgx: detail.unitTransferPriceUgx,
          unitCostUgx: detail.stock.costPerUnitUgx,
          condition: detail.condition,
        })

        await tx
          .update(shopStock)
          .set({
            quantityOnHand: sql`${shopStock.quantityOnHand} - ${detail.quantityDispatched}`,
          })
          .where(eq(shopStock.id, detail.stock.id))
      }

      return storeReturn
    })
  })

const receiveStoreReturnInput = z.object({
  storeReturnId: z.string().uuid(),
  itemReceipts: z.array(
    z.object({
      storeReturnItemId: z.string().uuid(),
      quantityReceived: z.number().int().nonnegative(),
    }),
  ),
})

/**
 * Store confirms receipt of returned goods. Posts reverse journal entries
 * for the original transfer (Inventory shift back, Due-from/Due-to nets,
 * Store Transfer Revenue reversal) and increments store stock for the
 * received quantities. Damaged items land in Damaged Inventory - Store.
 */
export const receiveStoreReturn = createServerFn()
  .inputValidator(receiveStoreReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    return db.transaction(async (tx) => {
      const storeReturn = await tx.query.storeReturns.findFirst({
        where: eq(storeReturns.id, data.storeReturnId),
        with: { items: true },
      })
      if (!storeReturn) {
        throw new Error(`Store return not found: ${data.storeReturnId}`)
      }
      if (storeReturn.status !== "dispatched") {
        throw new Error(
          `Store return ${storeReturn.documentNumber} is ${storeReturn.status}, expected "dispatched"`,
        )
      }

      let totalTransferPriceResellable = new BigNumber(0)
      let totalTransferPriceDamaged = new BigNumber(0)
      let totalCostResellable = new BigNumber(0)
      let totalCostDamaged = new BigNumber(0)

      for (const receipt of data.itemReceipts) {
        const item = storeReturn.items.find(
          (i) => i.id === receipt.storeReturnItemId,
        )
        if (!item) {
          throw new Error(`Return item not found: ${receipt.storeReturnItemId}`)
        }
        if (receipt.quantityReceived > item.quantityDispatched) {
          throw new Error(
            `Received ${receipt.quantityReceived} > dispatched ${item.quantityDispatched} for ${item.productName}`,
          )
        }
        await tx
          .update(storeReturnItems)
          .set({ quantityReceived: receipt.quantityReceived })
          .where(eq(storeReturnItems.id, receipt.storeReturnItemId))

        const transferAmount = new BigNumber(item.unitTransferPriceUgx).times(
          receipt.quantityReceived,
        )
        const costAmount = new BigNumber(item.unitCostUgx).times(
          receipt.quantityReceived,
        )

        if (item.condition === "resellable") {
          totalTransferPriceResellable = totalTransferPriceResellable.plus(transferAmount)
          totalCostResellable = totalCostResellable.plus(costAmount)
          // Increment store stock — find the matching store_stock row by product
          const matching = await tx.query.storeStock.findFirst({
            where: eq(storeStock.productName, item.productName),
          })
          if (matching) {
            await tx
              .update(storeStock)
              .set({
                quantityOnHand: sql`${storeStock.quantityOnHand} + ${receipt.quantityReceived}`,
              })
              .where(eq(storeStock.id, matching.id))
          }
        } else {
          totalTransferPriceDamaged = totalTransferPriceDamaged.plus(transferAmount)
          totalCostDamaged = totalCostDamaged.plus(costAmount)
        }
      }

      const totalTransferPrice = totalTransferPriceResellable.plus(
        totalTransferPriceDamaged,
      )
      const totalCost = totalCostResellable.plus(totalCostDamaged)
      const totalMargin = totalTransferPrice.minus(totalCost)

      // Reverse the original transfer's journal entries
      const entries: Array<{
        type: "debit" | "credit"
        category: string
        amount: string
      }> = []
      if (totalCostResellable.gt(0)) {
        entries.push({
          type: "debit",
          category: "Inventory - Store",
          amount: totalCostResellable.toFixed(2),
        })
      }
      if (totalCostDamaged.gt(0)) {
        entries.push({
          type: "debit",
          category: "Damaged Inventory - Store",
          amount: totalCostDamaged.toFixed(2),
        })
      }
      entries.push({
        type: "credit",
        category: "Inventory - Shop",
        amount: totalTransferPrice.toFixed(2),
      })
      if (totalMargin.gt(0)) {
        entries.push({
          type: "debit",
          category: "Store Transfer Revenue",
          amount: totalMargin.toFixed(2),
        })
      }
      // Reverse inter-branch balances
      entries.push({
        type: "debit",
        category: "Due to Store",
        amount: totalTransferPrice.toFixed(2),
      })
      entries.push({
        type: "credit",
        category: "Due from Shop",
        amount: totalTransferPrice.toFixed(2),
      })

      await postJournalEntry(tx, {
        entries,
        referenceType: "store_return",
        referenceId: storeReturn.id,
        locationType: "store",
        locationId: storeReturn.storeId,
        recordedBy: userId,
        description: `Store return ${storeReturn.documentNumber} received`,
      })

      await tx
        .update(storeReturns)
        .set({ status: "received", receivedBy: userId })
        .where(eq(storeReturns.id, data.storeReturnId))

      return { ok: true }
    })
  })
