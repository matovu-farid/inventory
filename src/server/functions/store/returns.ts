import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db } from '#/db'
import {
  items,
  storeReturns,
  storeReturnLines,
  storeReturnLineAllocations,
  shopStock,
  storeStock,
  shops,
} from '#/db/schema'
import { postJournalEntry } from '#/lib/accounting/ledger'
import { nextDocumentNumber } from '#/lib/document-numbers-db'
import { recordAuditLog } from '#/server/middleware/audit-store'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { formatItemLabel, formatItemLabelUnresolved } from '#/lib/items'
import { pickShopStockFifo } from '#/server/functions/shop/fifo'
import { buildStoreReturnReceiveEntries } from './return-entries'
import { renderAuditDescription } from '#/server/audit/descriptions'
import { resolveArticleNumbersForAudit } from '#/server/audit/article-numbers'
import { formatItemArticleNumbers } from '#/lib/items/article-number'
import { getActorName } from '#/server/audit/actor'

const returnItemInput = z.object({
  itemId: z.uuid(),
  variantId: z.uuid().optional(),
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
 * Shop dispatches goods back to the store (Plan 2b — item-level).
 * Decrements shop_stock immediately via FIFO allocations; journal
 * entries are deferred to receiveStoreReturn since goods are "in
 * transit" until the store confirms.
 */
export const dispatchStoreReturn = createServerFn()
  .inputValidator(dispatchStoreReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const planned: Array<{
        itemId: string
        variantId: string | null
        quantityDispatched: number
        unitTransferPrice: BigNumber
        unitCost: BigNumber
        allocations: Array<{
          shopStockId: string
          quantity: number
          costPerUnitUgx: string
          supplyRouteLineId: string | null
        }>
      }> = []

      for (const input of data.items) {
        const item = await tx.query.items.findFirst({
          where: eq(items.id, input.itemId),
          columns: { id: true, name: true },
          with: { articleNumbers: true },
        })
        if (!item) throw new Error(`Item not found: ${input.itemId}`)

        const plan = await pickShopStockFifo(tx, {
          shopId: data.shopId,
          itemId: input.itemId,
          variantId: input.variantId,
          quantity: input.quantityDispatched,
        })
        if (plan.shortfall > 0) {
          const label = input.variantId
            ? formatItemLabel(
                formatItemArticleNumbers(item.articleNumbers),
                item.name,
                '',
              )
            : formatItemLabelUnresolved(
                formatItemArticleNumbers(item.articleNumbers),
                item.name,
              )
          throw new Error(
            `Insufficient stock for ${label}: short by ${plan.shortfall}`,
          )
        }

        const lineCost = plan.allocations.reduce(
          (s, a) => s.plus(new BigNumber(a.costPerUnitUgx).times(a.quantity)),
          new BigNumber(0),
        )
        const unitCost = new BigNumber(lineCost).div(input.quantityDispatched)

        planned.push({
          itemId: input.itemId,
          variantId: input.variantId ?? null,
          quantityDispatched: input.quantityDispatched,
          unitTransferPrice: new BigNumber(input.unitTransferPriceUgx),
          unitCost,
          allocations: plan.allocations,
        })
      }

      const docNumber = await nextDocumentNumber(tx, 'STR-RET')
      const [storeReturn] = await tx
        .insert(storeReturns)
        .values({
          shopId: data.shopId,
          storeId: data.storeId,
          originalTransferId: data.originalTransferId,
          returnDate: new Date(),
          reason: data.reason,
          status: 'dispatched',
          dispatchedBy: userId,
          approvedBy: userId,
          documentNumber: docNumber.formatted,
          notes: data.notes,
        })
        .returning()

      for (const detail of planned) {
        const [line] = await tx
          .insert(storeReturnLines)
          .values({
            storeReturnId: storeReturn.id,
            itemId: detail.itemId,
            variantId: detail.variantId,
            shopStockId: null,
            quantityDispatched: detail.quantityDispatched,
            unitTransferPriceUgx: detail.unitTransferPrice.toFixed(2),
            unitCostUgx: detail.unitCost.toFixed(2),
          })
          .returning()

        for (const alloc of detail.allocations) {
          await tx.insert(storeReturnLineAllocations).values({
            storeReturnLineId: line.id,
            shopStockId: alloc.shopStockId,
            supplyRouteLineId: alloc.supplyRouteLineId,
            quantity: alloc.quantity,
            costPerUnitUgx: alloc.costPerUnitUgx,
          })
          await tx
            .update(shopStock)
            .set({
              quantityOnHand: sql`${shopStock.quantityOnHand} - ${alloc.quantity}`,
            })
            .where(eq(shopStock.id, alloc.shopStockId))
        }
      }

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, data.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: 'storeReturn.dispatch',
        entityType: 'store_return',
        entityId: storeReturn.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'storeReturn.dispatch',
        entityType: 'store_return',
        entityId: storeReturn.id,
        description: renderAuditDescription('storeReturn.dispatch', {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        after: {
          status: 'dispatched',
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
 * Store confirms receipt of returned goods (Plan 2b — item-level).
 * Posts reverse journal entries for the original transfer (Inventory
 * shift back, Due-from/Due-to nets, Store Transfer Revenue reversal)
 * and rebuilds store_stock per allocation so the supply-line + cost
 * provenance of each returned lot survives the round trip.
 */
export const receiveStoreReturn = createServerFn()
  .inputValidator(receiveStoreReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const storeReturn = await tx.query.storeReturns.findFirst({
        where: eq(storeReturns.id, data.storeReturnId),
        with: {
          items: {
            with: {
              item: { with: { articleNumbers: true } },
              variant: { with: { color: true } },
              allocations: true,
            },
          },
        },
      })
      if (!storeReturn) {
        throw new Error(`Store return not found: ${data.storeReturnId}`)
      }
      if (storeReturn.status !== 'dispatched') {
        throw new Error(
          `Store return ${storeReturn.documentNumber} is ${storeReturn.status}, expected "dispatched"`,
        )
      }

      let totalTransferPrice = new BigNumber(0)
      let totalCost = new BigNumber(0)
      let totalCostDispatched = new BigNumber(0)
      let totalTransferDispatched = new BigNumber(0)

      for (const line of storeReturn.items) {
        totalCostDispatched = totalCostDispatched.plus(
          new BigNumber(line.unitCostUgx).times(line.quantityDispatched),
        )
        totalTransferDispatched = totalTransferDispatched.plus(
          new BigNumber(line.unitTransferPriceUgx).times(
            line.quantityDispatched,
          ),
        )
      }

      for (const receipt of data.itemReceipts) {
        const line = storeReturn.items.find(
          (l) => l.id === receipt.storeReturnItemId,
        )
        if (!line) {
          throw new Error(`Return line not found: ${receipt.storeReturnItemId}`)
        }
        const label = line.variant
          ? formatItemLabel(
              formatItemArticleNumbers(line.item.articleNumbers),
              line.variant.color.colorName,
              line.variant.size,
            )
          : formatItemLabelUnresolved(
              formatItemArticleNumbers(line.item.articleNumbers),
              line.item.name,
            )
        if (receipt.quantityReceived > line.quantityDispatched) {
          throw new Error(
            `Received ${receipt.quantityReceived} > dispatched ${line.quantityDispatched} for ${label}`,
          )
        }

        await tx
          .update(storeReturnLines)
          .set({ quantityReceived: receipt.quantityReceived })
          .where(eq(storeReturnLines.id, receipt.storeReturnItemId))

        const transferAmount = new BigNumber(line.unitTransferPriceUgx).times(
          receipt.quantityReceived,
        )
        const costAmount = new BigNumber(line.unitCostUgx).times(
          receipt.quantityReceived,
        )
        totalTransferPrice = totalTransferPrice.plus(transferAmount)
        totalCost = totalCost.plus(costAmount)

        if (receipt.quantityReceived <= 0) continue

        // Distribute received qty across the line's allocations
        // proportionally; last bucket absorbs rounding (mirrors
        // confirmTransferReceipt's partial-receipt behaviour).
        const allocs = [...line.allocations].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        )
        const totalAllocQty = allocs.reduce((s, a) => s + a.quantity, 0)
        let distributed = 0
        for (let i = 0; i < allocs.length; i++) {
          const a = allocs[i]
          const portion =
            i === allocs.length - 1
              ? receipt.quantityReceived - distributed
              : Math.floor(
                  (a.quantity / totalAllocQty) * receipt.quantityReceived,
                )
          distributed += portion
          if (portion <= 0) continue

          // Upsert store_stock keyed (storeId, itemId, variantId, supplyRouteLineId)
          const variantWhere = line.variantId
            ? eq(storeStock.variantId, line.variantId)
            : sql`${storeStock.variantId} IS NULL`
          const lineWhere = a.supplyRouteLineId
            ? eq(storeStock.supplyRouteLineId, a.supplyRouteLineId)
            : sql`${storeStock.supplyRouteLineId} IS NULL`
          const existing = await tx.query.storeStock.findFirst({
            where: and(
              eq(storeStock.storeId, storeReturn.storeId),
              eq(storeStock.itemId, line.itemId),
              variantWhere,
              lineWhere,
            ),
          })
          if (existing) {
            await tx
              .update(storeStock)
              .set({
                quantityOnHand: sql`${storeStock.quantityOnHand} + ${portion}`,
              })
              .where(eq(storeStock.id, existing.id))
          } else {
            await tx.insert(storeStock).values({
              storeId: storeReturn.storeId,
              itemId: line.itemId,
              variantId: line.variantId,
              supplyRouteLineId: a.supplyRouteLineId,
              quantityOnHand: portion,
              costPerUnitUgx: a.costPerUnitUgx,
            })
          }
        }
      }

      const { entries } = buildStoreReturnReceiveEntries({
        totalCost: totalCost.toFixed(2),
        totalTransferPrice: totalTransferPrice.toFixed(2),
        totalCostDispatched: totalCostDispatched.toFixed(2),
        totalTransferDispatched: totalTransferDispatched.toFixed(2),
      })

      if (entries.length > 0) {
        await postJournalEntry(tx, {
          entries,
          referenceType: 'store_return',
          referenceId: storeReturn.id,
          locationType: 'store',
          locationId: storeReturn.storeId,
          recordedBy: userId,
          description: `Store return ${storeReturn.documentNumber} received`,
        })
      }

      await tx
        .update(storeReturns)
        .set({ status: 'received', receivedBy: userId })
        .where(eq(storeReturns.id, data.storeReturnId))

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, storeReturn.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: 'storeReturn.receive',
        entityType: 'store_return',
        entityId: storeReturn.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'storeReturn.receive',
        entityType: 'store_return',
        entityId: storeReturn.id,
        description: renderAuditDescription('storeReturn.receive', {
          actorName,
          shopName: shop?.name,
          itemCount: data.itemReceipts.length,
        }),
        articleNumbers,
        before: { status: 'dispatched' },
        after: { status: 'received' },
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
