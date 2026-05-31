import { createServerFn } from "@tanstack/react-start"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  storeReturns,
  storeReturnLines,
  shopStock,
  storeStock,
  shops,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { nextDocumentNumber } from "#/lib/document-numbers-db"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatItemLabel } from "#/lib/items"
import { buildStoreReturnReceiveEntries } from "./return-entries"
import { renderAuditDescription } from "#/server/audit/descriptions"
import { resolveArticleNumbersForAudit } from "#/server/audit/article-numbers"
import { getActorName } from "#/server/audit/actor"

const returnItemInput = z.object({
  shopStockId: z.uuid(),
  quantityDispatched: z.number().int().positive(),
  unitTransferPriceUgx: z.string(),
})

const dispatchStoreReturnInput = z.object({
  shopId: z.uuid(),
  storeId: z.uuid(),
  originalTransferId: z.uuid().optional(),
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
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const itemDetails = []
      for (const item of data.items) {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, item.shopStockId),
          with: { variant: { with: { color: { with: { item: true } } } } },
        })
        if (!stock) throw new Error(`Stock item not found: ${item.shopStockId}`)
        const itemLabel = formatItemLabel(
          stock.variant.color.item.articleNumber,
          stock.variant.color.colorName,
          stock.variant.size,
        )
        if (stock.quantityOnHand < item.quantityDispatched) {
          throw new Error(
            `Insufficient stock for ${itemLabel}: have ${stock.quantityOnHand}, need ${item.quantityDispatched}`,
          )
        }
        itemDetails.push({ stock, itemLabel, ...item })
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
        await tx.insert(storeReturnLines).values({
          storeReturnId: storeReturn.id,
          shopStockId: detail.stock.id,
          quantityDispatched: detail.quantityDispatched,
          unitTransferPriceUgx: detail.unitTransferPriceUgx,
          unitCostUgx: detail.stock.costPerUnitUgx,
        })

        await tx
          .update(shopStock)
          .set({
            quantityOnHand: sql`${shopStock.quantityOnHand} - ${detail.quantityDispatched}`,
          })
          .where(eq(shopStock.id, detail.stock.id))
      }

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, data.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: "storeReturn.dispatch",
        entityType: "store_return",
        entityId: storeReturn.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "storeReturn.dispatch",
        entityType: "store_return",
        entityId: storeReturn.id,
        description: renderAuditDescription("storeReturn.dispatch", {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        after: {
          status: "dispatched",
          shopId: data.shopId,
          storeId: data.storeId,
          documentNumber: docNumber.formatted,
          reason: data.reason,
        },
        metadata: {
          itemCount: data.items.length,
          originalTransferId: data.originalTransferId,
        },
      })

      return storeReturn
    })
  })

const receiveStoreReturnInput = z.object({
  storeReturnId: z.uuid(),
  itemReceipts: z.array(
    z.object({
      storeReturnItemId: z.uuid(),
      quantityReceived: z.number().int().nonnegative(),
    }),
  ),
})

/**
 * Store confirms receipt of returned goods. Posts reverse journal entries
 * for the original transfer (Inventory shift back, Due-from/Due-to nets,
 * Store Transfer Revenue reversal) and increments store stock for the
 * received quantities.
 */
export const receiveStoreReturn = createServerFn()
  .inputValidator(receiveStoreReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const storeReturn = await tx.query.storeReturns.findFirst({
        where: eq(storeReturns.id, data.storeReturnId),
        with: {
          items: {
            with: {
              shopStock: {
                with: { variant: { with: { color: { with: { item: true } } } } },
              },
            },
          },
        },
      })
      if (!storeReturn) {
        throw new Error(`Store return not found: ${data.storeReturnId}`)
      }
      if (storeReturn.status !== "dispatched") {
        throw new Error(
          `Store return ${storeReturn.documentNumber} is ${storeReturn.status}, expected "dispatched"`,
        )
      }

      let totalTransferPrice = new BigNumber(0)
      let totalCost = new BigNumber(0)
      let totalCostDispatched = new BigNumber(0)
      let totalTransferDispatched = new BigNumber(0)

      for (const item of storeReturn.items) {
        totalCostDispatched = totalCostDispatched.plus(
          new BigNumber(item.unitCostUgx).times(item.quantityDispatched),
        )
        totalTransferDispatched = totalTransferDispatched.plus(
          new BigNumber(item.unitTransferPriceUgx).times(item.quantityDispatched),
        )
      }

      for (const receipt of data.itemReceipts) {
        const item = storeReturn.items.find(
          (i) => i.id === receipt.storeReturnItemId,
        )
        if (!item) {
          throw new Error(`Return item not found: ${receipt.storeReturnItemId}`)
        }
        const itemLabel = formatItemLabel(
          item.shopStock.variant.color.item.articleNumber,
          item.shopStock.variant.color.colorName,
          item.shopStock.variant.size,
        )
        if (receipt.quantityReceived > item.quantityDispatched) {
          throw new Error(
            `Received ${receipt.quantityReceived} > dispatched ${item.quantityDispatched} for ${itemLabel}`,
          )
        }
        await tx
          .update(storeReturnLines)
          .set({ quantityReceived: receipt.quantityReceived })
          .where(eq(storeReturnLines.id, receipt.storeReturnItemId))

        const transferAmount = new BigNumber(item.unitTransferPriceUgx).times(
          receipt.quantityReceived,
        )
        const costAmount = new BigNumber(item.unitCostUgx).times(
          receipt.quantityReceived,
        )

        totalTransferPrice = totalTransferPrice.plus(transferAmount)
        totalCost = totalCost.plus(costAmount)

        // Increment store stock — find the matching store_stock variant
        const matching = await tx.query.storeStock.findFirst({
          where: and(
            eq(storeStock.storeId, storeReturn.storeId),
            eq(storeStock.variantId, item.shopStock.variantId),
          ),
        })
        if (matching) {
          await tx
            .update(storeStock)
            .set({
              quantityOnHand: sql`${storeStock.quantityOnHand} + ${receipt.quantityReceived}`,
            })
            .where(eq(storeStock.id, matching.id))
        }
      }

      // Build the (always balanced) reversal journal via the pure helper.
      const { entries } = buildStoreReturnReceiveEntries({
        totalCost: totalCost.toFixed(2),
        totalTransferPrice: totalTransferPrice.toFixed(2),
        totalCostDispatched: totalCostDispatched.toFixed(2),
        totalTransferDispatched: totalTransferDispatched.toFixed(2),
      })

      if (entries.length > 0) {
        await postJournalEntry(tx, {
          entries,
          referenceType: "store_return",
          referenceId: storeReturn.id,
          locationType: "store",
          locationId: storeReturn.storeId,
          recordedBy: userId,
          description: `Store return ${storeReturn.documentNumber} received`,
        })
      }

      await tx
        .update(storeReturns)
        .set({ status: "received", receivedBy: userId })
        .where(eq(storeReturns.id, data.storeReturnId))

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, storeReturn.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: "storeReturn.receive",
        entityType: "store_return",
        entityId: storeReturn.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "storeReturn.receive",
        entityType: "store_return",
        entityId: storeReturn.id,
        description: renderAuditDescription("storeReturn.receive", {
          actorName,
          shopName: shop?.name,
          itemCount: data.itemReceipts.length,
        }),
        articleNumbers,
        before: { status: "dispatched" },
        after: { status: "received" },
        metadata: {
          itemCount: data.itemReceipts.length,
          documentNumber: storeReturn.documentNumber,
          totalTransferPriceUgx: totalTransferPrice.toFixed(2),
          totalCostUgx: totalCost.toFixed(2),
        },
      })

      return { ok: true }
    })
  })
