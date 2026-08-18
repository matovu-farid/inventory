import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db } from '#/db'
import {
  stockTakes,
  stockTakeLines,
  storeStock,
  shopStock,
  shops,
  stores,
} from '#/db/schema'
import { postJournalEntry } from '#/lib/accounting/ledger'
import { recordAuditLog } from '#/server/middleware/audit-store'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { formatItemLabel } from '#/lib/items'
import { renderAuditDescription } from '#/server/audit/descriptions'
import { resolveArticleNumbersForAudit } from '#/server/audit/article-numbers'
import { getActorName } from '#/server/audit/actor'
import { formatItemArticleNumbers } from '#/lib/items/article-number'

export const listStockTakes = createServerFn()
  .inputValidator(
    z.object({
      locationType: z.enum(['store', 'shop']),
      locationId: z.uuid(),
    }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    return db.query.stockTakes.findMany({
      where: (st, { and, eq: e }) =>
        and(
          e(st.locationType, data.locationType),
          e(st.locationId, data.locationId),
        ),
      with: { items: true },
      orderBy: (st, { desc }) => [desc(st.stockTakeDate)],
    })
  })

const startStockTakeInput = z.object({
  locationType: z.enum(['store', 'shop']),
  locationId: z.uuid(),
})

/**
 * Start a stock take: creates the stock take record and pre-populates
 * items with current system quantities.
 */
export const startStockTake = createServerFn()
  .inputValidator(startStockTakeInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const [st] = await tx
        .insert(stockTakes)
        .values({
          locationType: data.locationType,
          locationId: data.locationId,
          stockTakeDate: new Date(),
          conductedBy: userId,
        })
        .returning()

      let itemCount = 0
      // Get current stock for this location
      if (data.locationType === 'store') {
        const items = await tx.query.storeStock.findMany({
          where: eq(storeStock.storeId, data.locationId),
          with: {
            item: { with: { articleNumbers: true } },
            variant: {
              with: {
                color: { with: { item: { with: { articleNumbers: true } } } },
              },
            },
          },
        })
        for (const item of items) {
          // Unresolved (variant_id NULL) store stock still gets counted —
          // it just shows up as the bare item label without color/size.
          const itemLabel = item.variant
            ? formatItemLabel(
                formatItemArticleNumbers(
                  item.variant.color.item.articleNumbers,
                ),
                item.variant.color.colorName,
                item.variant.size,
              )
            : `${formatItemArticleNumbers(item.item.articleNumbers)} — ${item.item.name}`
          await tx.insert(stockTakeLines).values({
            stockTakeId: st.id,
            storeStockId: item.id,
            itemId: item.itemId,
            variantId: item.variantId,
            itemName: itemLabel,
            systemQuantity: item.quantityOnHand,
            physicalQuantity: item.quantityOnHand, // default to matching
            discrepancy: 0,
          })
          itemCount++
        }
      } else {
        const items = await tx.query.shopStock.findMany({
          where: eq(shopStock.shopId, data.locationId),
          with: {
            item: { with: { articleNumbers: true } },
            variant: {
              with: {
                color: { with: { item: { with: { articleNumbers: true } } } },
              },
            },
          },
        })
        for (const item of items) {
          // Plan 2a/Task 14: shop_stock.variant_id is nullable. Unresolved
          // rows still count — they just appear under the bare item label.
          const itemLabel = item.variant
            ? formatItemLabel(
                formatItemArticleNumbers(
                  item.variant.color.item.articleNumbers,
                ),
                item.variant.color.colorName,
                item.variant.size,
              )
            : `${formatItemArticleNumbers(item.item.articleNumbers)} — ${item.item.name}`
          await tx.insert(stockTakeLines).values({
            stockTakeId: st.id,
            shopStockId: item.id,
            itemId: item.itemId,
            variantId: item.variantId,
            itemName: itemLabel,
            systemQuantity: item.quantityOnHand,
            physicalQuantity: item.quantityOnHand,
            discrepancy: 0,
          })
          itemCount++
        }
      }

      const actorName = await getActorName(tx, userId)
      const locationShop =
        data.locationType === 'shop'
          ? await tx.query.shops.findFirst({
              where: eq(shops.id, data.locationId),
            })
          : undefined
      const locationStore =
        data.locationType === 'store'
          ? await tx.query.stores.findFirst({
              where: eq(stores.id, data.locationId),
            })
          : undefined
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: 'stockTake.start',
        entityType: 'stock_take',
        entityId: st.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'stockTake.start',
        entityType: 'stock_take',
        entityId: st.id,
        description: renderAuditDescription('stockTake.start', {
          actorName,
          shopName: locationShop?.name,
          storeName: locationStore?.name,
          itemCount,
        }),
        articleNumbers,
        after: {
          locationType: data.locationType,
          locationId: data.locationId,
          status: st.status,
        },
        metadata: {
          itemCount,
        },
      })

      return st
    })
  })

const recordCountInput = z.object({
  stockTakeItemId: z.uuid(),
  physicalQuantity: z.number().int().min(0),
  notes: z.string().optional(),
})

export const recordPhysicalCount = createServerFn()
  .inputValidator(recordCountInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    const item = await db.query.stockTakeLines.findFirst({
      where: eq(stockTakeLines.id, data.stockTakeItemId),
    })
    if (!item) throw new Error('Stock take item not found')

    const discrepancy = data.physicalQuantity - item.systemQuantity

    const [updated] = await db
      .update(stockTakeLines)
      .set({
        physicalQuantity: data.physicalQuantity,
        discrepancy,
        notes: data.notes,
      })
      .where(eq(stockTakeLines.id, data.stockTakeItemId))
      .returning()

    return updated
  })

const reconcileInput = z.object({ stockTakeId: z.uuid() })

/**
 * Reconcile a stock take: adjust system quantities to physical counts
 * and post ledger entries for losses.
 */
export const reconcileStockTake = createServerFn()
  .inputValidator(reconcileInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const st = await tx.query.stockTakes.findFirst({
        where: eq(stockTakes.id, data.stockTakeId),
        with: { items: true },
      })
      if (!st) throw new Error('Stock take not found')
      if (st.status === 'reconciled') throw new Error('Already reconciled')

      for (const item of st.items) {
        if (item.discrepancy === 0) continue

        // Adjust system quantity
        if (st.locationType === 'store' && item.storeStockId) {
          const stock = await tx.query.storeStock.findFirst({
            where: eq(storeStock.id, item.storeStockId),
          })
          if (stock) {
            await tx
              .update(storeStock)
              .set({ quantityOnHand: item.physicalQuantity })
              .where(eq(storeStock.id, item.storeStockId))

            // Post loss entry if shrinkage
            if (item.discrepancy < 0) {
              const lossQty = Math.abs(item.discrepancy)
              const lossValue = new BigNumber(stock.costPerUnitUgx).times(
                lossQty,
              )
              await postJournalEntry(tx, {
                entries: [
                  {
                    type: 'debit',
                    category: 'Inventory Loss',
                    amount: lossValue.toFixed(2),
                  },
                  {
                    type: 'credit',
                    category: 'Inventory - Store',
                    amount: lossValue.toFixed(2),
                  },
                ],
                referenceType: 'stock_take_adjustment',
                referenceId: st.id,
                locationType: 'store',
                locationId: st.locationId,
                recordedBy: userId,
                description: `Shrinkage: ${lossQty}x ${item.itemName}`,
              })
            }
          }
        } else if (st.locationType === 'shop' && item.shopStockId) {
          const stock = await tx.query.shopStock.findFirst({
            where: eq(shopStock.id, item.shopStockId),
          })
          if (stock) {
            await tx
              .update(shopStock)
              .set({ quantityOnHand: item.physicalQuantity })
              .where(eq(shopStock.id, item.shopStockId))

            if (item.discrepancy < 0) {
              const lossQty = Math.abs(item.discrepancy)
              const lossValue = new BigNumber(stock.costPerUnitUgx).times(
                lossQty,
              )
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
                referenceType: 'stock_take_adjustment',
                referenceId: st.id,
                locationType: 'shop',
                locationId: st.locationId,
                recordedBy: userId,
                description: `Shrinkage: ${lossQty}x ${item.itemName}`,
              })
            }
          }
        }
      }

      // Mark stock take as reconciled
      await tx
        .update(stockTakes)
        .set({ status: 'reconciled' })
        .where(eq(stockTakes.id, data.stockTakeId))

      const discrepancyCount = st.items.filter(
        (i) => i.discrepancy !== 0,
      ).length
      const totalShrinkage = st.items.reduce(
        (sum, i) => sum + (i.discrepancy < 0 ? Math.abs(i.discrepancy) : 0),
        0,
      )
      const totalOverage = st.items.reduce(
        (sum, i) => sum + (i.discrepancy > 0 ? i.discrepancy : 0),
        0,
      )

      const actorName = await getActorName(tx, userId)
      const locationShop =
        st.locationType === 'shop'
          ? await tx.query.shops.findFirst({
              where: eq(shops.id, st.locationId),
            })
          : undefined
      const locationStore =
        st.locationType === 'store'
          ? await tx.query.stores.findFirst({
              where: eq(stores.id, st.locationId),
            })
          : undefined
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: 'stockTake.reconcile',
        entityType: 'stock_take',
        entityId: st.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'stockTake.reconcile',
        entityType: 'stock_take',
        entityId: st.id,
        description: renderAuditDescription('stockTake.reconcile', {
          actorName,
          shopName: locationShop?.name,
          storeName: locationStore?.name,
          itemCount: discrepancyCount,
        }),
        articleNumbers,
        before: { status: st.status },
        after: { status: 'reconciled' },
        metadata: {
          locationType: st.locationType,
          locationId: st.locationId,
          itemCount: st.items.length,
          discrepancyCount,
          totalShrinkage,
          totalOverage,
        },
      })

      return { reconciled: true }
    })
  })
