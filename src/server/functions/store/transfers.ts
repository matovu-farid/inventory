import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db } from '#/db'
import {
  storeTransfers,
  storeTransferLines,
  storeTransferAllocations,
  storeStock,
  shopStock,
  shops,
  items,
} from '#/db/schema'
import { postJournalEntry } from '#/lib/accounting/ledger'
import { recordAuditLog } from '#/server/middleware/audit-store'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { formatItemLabel } from '#/lib/items'
import { renderAuditDescription } from '#/server/audit/descriptions'
import { resolveArticleNumbersForAudit } from '#/server/audit/article-numbers'
import { getActorName } from '#/server/audit/actor'
import {
  validateDiscrepancyNotes,
  validateQuantityReceived,
} from './receive-validate'
import { buildTransferInventoryEntries } from './transfer-entries'
import { pickStoreStockFifo } from './fifo'

export const listTransfers = createServerFn().handler(async () => {
  await requireSessionAndRole(['admin', 'supervisor'])

  return db.query.storeTransfers.findMany({
    orderBy: (t, { desc }) => [desc(t.transferDate)],
    with: {
      shop: true,
      items: {
        with: {
          item: true,
          variant: { with: { color: true } },
          allocations: true,
        },
      },
    },
  })
})

const transferItemInput = z.object({
  /** Item-level dispatch — the FIFO picker chooses which store_stock
   *  rows to drain. `variantId` narrows the pool to a single variant
   *  when set; when omitted, unresolved lots drain first, then
   *  variant-keyed lots, both oldest-supply-line first. */
  itemId: z.uuid(),
  variantId: z.uuid().optional(),
  quantityDispatched: z.number().int().positive(),
})

const createTransferInput = z.object({
  shopId: z.uuid(),
  notes: z.string().optional(),
  items: z.array(transferItemInput).min(1),
})

/**
 * Create and dispatch a transfer from store to a shop.
 *
 * 1. Plans an item-level FIFO allocation across source store_stock rows
 *    via `pickStoreStockFifo`. Throws if total on-hand < requested.
 * 2. Records one `store_transfer_lines` row per requested item with
 *    `storeStockId = null` (item-level dispatch) plus one
 *    `store_transfer_allocations` row per source lot drained.
 * 3. Decrements each source `store_stock.quantityOnHand`.
 * 4. Posts compound ledger entries:
 *    DR Inventory-Shop (transfer price)   / CR Inventory-Store (cost)
 *                                         / CR Store Transfer Revenue (margin)
 *    DR Due from Shop (transfer price)    / CR Due to Store (transfer price)
 *
 * The unit transfer price now comes from the item-level floor
 * (`items.minimum_sell_price_ugx`) — Plan 2a Task 7 dropped the per-line
 * price override input. The total cost is the weighted sum across the
 * FIFO allocations (lot costs may differ).
 */
export const createTransfer = createServerFn()
  .inputValidator(createTransferInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error('Store not configured')

    return db.transaction(async (tx) => {
      // Create transfer header
      const [transfer] = await tx
        .insert(storeTransfers)
        .values({
          storeId: store.id,
          shopId: data.shopId,
          transferDate: new Date(),
          status: 'dispatched',
          dispatchedBy: userId,
          notes: data.notes,
        })
        .returning()

      let totalTransferValue = new BigNumber(0)
      let totalCostValue = new BigNumber(0)

      for (const item of data.items) {
        const itemRow = await tx.query.items.findFirst({
          where: eq(items.id, item.itemId),
        })
        if (!itemRow) throw new Error(`Item not found: ${item.itemId}`)

        // FIFO planning — unresolved lots first when variantId is
        // omitted, oldest supply line first within each group. The
        // picker runs inside this transaction so the read sees the
        // same snapshot as the subsequent decrements.
        const plan = await pickStoreStockFifo(tx, {
          storeId: store.id,
          itemId: item.itemId,
          variantId: item.variantId,
          quantity: item.quantityDispatched,
        })

        if (plan.shortfall > 0) {
          const onHand = item.quantityDispatched - plan.shortfall
          throw new Error(
            `Insufficient stock for ${itemRow.articleNumber} ${itemRow.name}: ` +
              `have ${onHand}, need ${item.quantityDispatched}`,
          )
        }

        const unitPrice = plan.allocations.reduce((max, a) => {
          const snapshot = new BigNumber(a.minimumSellPriceUgx)
          return BigNumber.maximum(
            max,
            snapshot.gt(0)
              ? snapshot
              : new BigNumber(itemRow.minimumSellPriceUgx),
          )
        }, new BigNumber(0))
        const totalPrice = unitPrice.times(item.quantityDispatched)
        // Cost: weighted sum across allocations (lot costs may differ).
        const totalCost = plan.allocations.reduce(
          (sum, a) =>
            sum.plus(new BigNumber(a.costPerUnitUgx).times(a.quantity)),
          new BigNumber(0),
        )

        // Item-level transfer line — `storeStockId = null` signals that
        // the per-source provenance lives in `store_transfer_allocations`.
        const [line] = await tx
          .insert(storeTransferLines)
          .values({
            storeTransferId: transfer.id,
            storeStockId: null,
            itemId: item.itemId,
            variantId: item.variantId ?? null,
            quantityDispatched: item.quantityDispatched,
            unitPriceUgx: unitPrice.toFixed(2),
            totalPriceUgx: totalPrice.toFixed(2),
          })
          .returning()

        // Record per-source allocations and decrement each source row.
        for (const alloc of plan.allocations) {
          await tx.insert(storeTransferAllocations).values({
            storeTransferLineId: line.id,
            storeStockId: alloc.storeStockId,
            supplyRouteLineId: alloc.supplyRouteLineId,
            quantity: alloc.quantity,
            costPerUnitUgx: alloc.costPerUnitUgx,
            minimumSellPriceUgx: new BigNumber(alloc.minimumSellPriceUgx).gt(0)
              ? alloc.minimumSellPriceUgx
              : itemRow.minimumSellPriceUgx,
          })
          await tx
            .update(storeStock)
            .set({
              quantityOnHand: sql`${storeStock.quantityOnHand} - ${alloc.quantity}`,
            })
            .where(eq(storeStock.id, alloc.storeStockId))
        }

        totalTransferValue = totalTransferValue.plus(totalPrice)
        totalCostValue = totalCostValue.plus(totalCost)
      }

      // Ledger: inventory movement (always balanced via the helper)
      const { entries: inventoryEntries } = buildTransferInventoryEntries({
        totalTransferValue: totalTransferValue.toFixed(2),
        totalCostValue: totalCostValue.toFixed(2),
      })

      await postJournalEntry(tx, {
        entries: inventoryEntries,
        referenceType: 'store_transfer',
        referenceId: transfer.id,
        locationType: 'store',
        locationId: store.id,
        recordedBy: userId,
        description: `Transfer to shop`,
      })

      // Ledger: inter-branch balance
      // DR Due from Shop / CR Due to Store
      await postJournalEntry(tx, {
        entries: [
          {
            type: 'debit',
            category: 'Due from Shop',
            amount: totalTransferValue.toFixed(2),
          },
          {
            type: 'credit',
            category: 'Due to Store',
            amount: totalTransferValue.toFixed(2),
          },
        ],
        referenceType: 'store_transfer',
        referenceId: transfer.id,
        locationType: 'store',
        locationId: store.id,
        recordedBy: userId,
        description: `Inter-branch balance for transfer`,
      })

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, data.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: 'transfer.create',
        entityType: 'store_transfer',
        entityId: transfer.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'transfer.create',
        entityType: 'store_transfer',
        entityId: transfer.id,
        description: renderAuditDescription('transfer.create', {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        after: {
          shopId: data.shopId,
          status: 'dispatched',
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
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      // Item-level transfer lines (Plan 2a Task 7) carry their source
      // provenance in `store_transfer_allocations`. The receive flow
      // walks those allocations to upsert one shop_stock row per
      // (shop, item, variant, supply_route_line), preserving per-lot
      // cost.
      const transfer = await tx.query.storeTransfers.findFirst({
        where: eq(storeTransfers.id, data.transferId),
        with: {
          items: {
            with: {
              item: true,
              variant: { with: { color: true } },
              allocations: true,
            },
          },
        },
      })
      if (!transfer) throw new Error('Transfer not found')
      if (transfer.status !== 'dispatched') {
        throw new Error(`Transfer is ${transfer.status}, expected dispatched`)
      }

      const store = await tx.query.stores.findFirst()
      if (!store) throw new Error('Store not configured')

      for (const receiptItem of data.items) {
        const tl = transfer.items.find(
          (i) => i.id === receiptItem.transferItemId,
        )
        if (!tl)
          throw new Error(
            `Transfer item not found: ${receiptItem.transferItemId}`,
          )

        // Idempotency guard — partial receipts not re-applied; use a
        // return flow to adjust.
        if (tl.quantityReceived !== null) {
          throw new Error(
            'This transfer item has already been received. Use a return flow to adjust.',
          )
        }

        validateQuantityReceived(receiptItem.quantityReceived)
        validateDiscrepancyNotes({
          quantityExpected: tl.quantityDispatched,
          quantityReceived: receiptItem.quantityReceived,
          discrepancyNotes: receiptItem.discrepancyNotes,
        })

        await tx
          .update(storeTransferLines)
          .set({
            quantityReceived: receiptItem.quantityReceived,
            discrepancyNotes: receiptItem.discrepancyNotes,
          })
          .where(eq(storeTransferLines.id, tl.id))

        // Distribute the received quantity across allocations
        // proportionally. Each bucket gets `floor(received * alloc / dispatched)`;
        // the last bucket absorbs the rounding remainder so the buckets
        // always sum to exactly `received`.
        const received = receiptItem.quantityReceived
        let remaining = received
        const lastIdx = tl.allocations.length - 1
        const buckets = tl.allocations.map((a, i) => {
          if (i === lastIdx) {
            return { alloc: a, take: remaining }
          }
          const share = Math.floor(
            (received * a.quantity) / tl.quantityDispatched,
          )
          remaining -= share
          return { alloc: a, take: share }
        })

        // Upsert shop_stock per (shop, item, variant, supply_route_line).
        // The unique key `uq_shst_shop_item_variant_line` is NULLS NOT
        // DISTINCT but `onConflict` still can't target nullable columns
        // cleanly, so we do an explicit find-then-insert-or-update.
        for (const { alloc, take } of buckets) {
          if (take <= 0) continue
          const existing = await tx.query.shopStock.findFirst({
            where: and(
              eq(shopStock.shopId, transfer.shopId),
              eq(shopStock.itemId, tl.itemId),
              tl.variantId
                ? eq(shopStock.variantId, tl.variantId)
                : isNull(shopStock.variantId),
              alloc.supplyRouteLineId
                ? eq(shopStock.supplyRouteLineId, alloc.supplyRouteLineId)
                : isNull(shopStock.supplyRouteLineId),
            ),
          })
          if (existing) {
            await tx
              .update(shopStock)
              .set({
                quantityOnHand: sql`${shopStock.quantityOnHand} + ${take}`,
              })
              .where(eq(shopStock.id, existing.id))
          } else {
            await tx.insert(shopStock).values({
              shopId: transfer.shopId,
              itemId: tl.itemId,
              variantId: tl.variantId,
              supplyRouteLineId: alloc.supplyRouteLineId,
              storeTransferItemId: tl.id,
              quantityOnHand: take,
              costPerUnitUgx: alloc.costPerUnitUgx,
              minimumSellPriceUgx: new BigNumber(alloc.minimumSellPriceUgx).gt(
                0,
              )
                ? alloc.minimumSellPriceUgx
                : tl.item.minimumSellPriceUgx,
            })
          }
        }

        // Distribution loss: items dispatched but never arrived at the
        // shop. Value at the line's unit transfer price (the item floor
        // captured at dispatch). Shape unchanged from the legacy path.
        const loss = tl.quantityDispatched - received
        if (loss > 0) {
          const lossValue = new BigNumber(tl.unitPriceUgx).times(loss)
          const itemLabel = tl.variant
            ? formatItemLabel(
                tl.item.articleNumber,
                tl.variant.color.colorName,
                tl.variant.size,
              )
            : `${tl.item.articleNumber} ${tl.item.name}`
          await postJournalEntry(tx, {
            entries: [
              {
                type: 'debit',
                category: 'Inventory Loss',
                amount: lossValue.toFixed(2),
              },
              {
                type: 'credit',
                category: 'Inventory - Shop',
                amount: lossValue.toFixed(2),
              },
            ],
            referenceType: 'distribution_loss',
            referenceId: tl.id,
            locationType: 'shop',
            locationId: transfer.shopId,
            recordedBy: userId,
            description: `Distribution loss: ${loss}× ${itemLabel}`,
          })
        }
      }

      // Update transfer status
      await tx
        .update(storeTransfers)
        .set({ status: 'received', receivedBy: userId })
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
        action: 'transfer.receive',
        entityType: 'store_transfer',
        entityId: data.transferId,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'transfer.receive',
        entityType: 'store_transfer',
        entityId: data.transferId,
        description: renderAuditDescription('transfer.receive', {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        before: { status: 'dispatched' },
        after: { status: 'received' },
        metadata: {
          itemCount: data.items.length,
          shopId: transfer.shopId,
          totalDistributionLoss: totalLoss,
        },
      })

      return { transferId: data.transferId, status: 'received' }
    })
  })
