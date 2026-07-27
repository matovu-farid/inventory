import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db  } from '#/db'
import type {Tx} from '#/db';
import {
  shopReturns,
  shopReturnLines,
  shopReturnLineAllocations,
  shopSaleLines,
  shopStock,
  shopSales,
  customers,
  shops,
  items,
} from '#/db/schema'
import { postJournalEntry } from '#/lib/accounting/ledger'
import { nextDocumentNumber } from '#/lib/document-numbers-db'
import { computeNewSaleStatus } from '#/lib/credit/payment-allocation'
import { isPaymentStatusOpen } from '#/lib/payment-status'
import { recordAuditLog } from '#/server/middleware/audit-store'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { validateCreditAdjustmentRefund } from './refund-validate'
import { renderAuditDescription } from '#/server/audit/descriptions'
import { resolveArticleNumbersForAudit } from '#/server/audit/article-numbers'
import { getActorName } from '#/server/audit/actor'

const returnItemInput = z.object({
  itemId: z.uuid(),
  variantId: z.uuid().optional(),
  quantity: z.number().int().positive(),
  unitRefundPriceUgx: z.string(),
})

const recordCustomerReturnInput = z.object({
  shopId: z.uuid(),
  originalSaleId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  reason: z.string().min(1),
  refundMethod: z.enum(['cash', 'bank', 'credit_adjustment']),
  bankAccountId: z.uuid().optional(),
  items: z.array(returnItemInput).min(1),
  notes: z.string().optional(),
})

/**
 * Plan a return-line lot reversal. Two modes:
 *   - With `originalSaleId`: walk the sale's allocations for the matching
 *     (item, variant) pair, oldest-first, up to the returned quantity.
 *     Re-stocks the exact lots the sale drained — COGS reversal posts
 *     against the original cost basis.
 *   - Without (open-counter return): re-stock the newest matching shop_stock
 *     lot — most likely to be the one the goods came from. If no row
 *     exists, throws (caller should hint the user that the lot has
 *     been fully sold or removed).
 */
async function planReturnAllocations(
  tx: Tx,
  input: {
    shopId: string
    itemId: string
    variantId: string | null
    quantity: number
    originalSaleId?: string
  },
): Promise<
  Array<{
    shopStockId: string
    quantity: number
    costPerUnitUgx: string
    supplyRouteLineId: string | null
  }>
> {
  const allocations: Array<{
    shopStockId: string
    quantity: number
    costPerUnitUgx: string
    supplyRouteLineId: string | null
  }> = []
  let remaining = input.quantity

  if (input.originalSaleId) {
    const variantWhere = input.variantId
      ? eq(shopSaleLines.variantId, input.variantId)
      : isNull(shopSaleLines.variantId)
    const saleLines = await tx.query.shopSaleLines.findMany({
      where: and(
        eq(shopSaleLines.shopSaleId, input.originalSaleId),
        eq(shopSaleLines.itemId, input.itemId),
        variantWhere,
      ),
      with: { allocations: true },
    })
    for (const line of saleLines) {
      const lineAllocs = [...line.allocations].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      )
      for (const a of lineAllocs) {
        if (remaining <= 0) break
        const take = Math.min(a.quantity, remaining)
        allocations.push({
          shopStockId: a.shopStockId,
          quantity: take,
          costPerUnitUgx: a.costPerUnitUgx,
          supplyRouteLineId: a.supplyRouteLineId,
        })
        remaining -= take
      }
      if (remaining <= 0) break
    }
  }

  if (remaining > 0) {
    // Fallback: newest matching lot. Used when there's no originalSale
    // *and* when the originalSale's allocations don't cover the qty.
    const variantWhere = input.variantId
      ? eq(shopStock.variantId, input.variantId)
      : isNull(shopStock.variantId)
    const target = await tx.query.shopStock.findFirst({
      where: and(
        eq(shopStock.shopId, input.shopId),
        eq(shopStock.itemId, input.itemId),
        variantWhere,
      ),
      orderBy: [desc(shopStock.createdAt)],
    })
    if (!target) {
      throw new Error(
        `No shop_stock row to re-stock for return — item ${input.itemId}` +
          (input.variantId ? ` variant ${input.variantId}` : ' (unresolved)'),
      )
    }
    allocations.push({
      shopStockId: target.id,
      quantity: remaining,
      costPerUnitUgx: target.costPerUnitUgx,
      supplyRouteLineId: target.supplyRouteLineId,
    })
  }

  return allocations
}

/**
 * Record a customer return to a shop (Plan 2b — item-level).
 *
 * Admin/Supervisor approval required. Returned items go back to sellable
 * shop stock; each return line records lot-level allocations so the
 * COGS reversal posts against the original cost basis.
 *
 *   DR Sales Returns (contra-revenue) / CR Cash | Bank | A/R
 *   DR Inventory - Shop / CR Cost of Goods Sold
 */
export const recordCustomerReturn = createServerFn()
  .inputValidator(recordCustomerReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin', 'supervisor'])
    const userId = session.user.id

    if (data.refundMethod === 'credit_adjustment' && !data.customerId) {
      throw new Error('customerId is required for credit_adjustment refunds')
    }

    return db.transaction(async (tx) => {
      if (data.customerId) {
        const customer = await tx.query.customers.findFirst({
          where: eq(customers.id, data.customerId),
        })
        if (!customer || customer.deletedAt) {
          throw new Error(`Customer not found: ${data.customerId}`)
        }
      }

      let totalRefund = new BigNumber(0)
      let totalCost = new BigNumber(0)

      const planned: Array<{
        itemId: string
        variantId: string | null
        quantity: number
        unitRefund: BigNumber
        totalRefund: BigNumber
        unitCost: BigNumber
        totalCost: BigNumber
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
          columns: { id: true },
        })
        if (!item) throw new Error(`Item not found: ${input.itemId}`)

        const allocations = await planReturnAllocations(tx, {
          shopId: data.shopId,
          itemId: input.itemId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          originalSaleId: data.originalSaleId,
        })

        const lineCost = allocations.reduce(
          (s, a) => s.plus(new BigNumber(a.costPerUnitUgx).times(a.quantity)),
          new BigNumber(0),
        )
        const unitCost = new BigNumber(lineCost).div(input.quantity)
        const unitRefund = new BigNumber(input.unitRefundPriceUgx)
        const totalRefundForItem = unitRefund.times(input.quantity)

        totalRefund = totalRefund.plus(totalRefundForItem)
        totalCost = totalCost.plus(lineCost)

        planned.push({
          itemId: item.id,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          unitRefund,
          totalRefund: totalRefundForItem,
          unitCost,
          totalCost: lineCost,
          allocations,
        })
      }

      const docNumber = await nextDocumentNumber(tx, 'RET')
      const [shopReturn] = await tx
        .insert(shopReturns)
        .values({
          shopId: data.shopId,
          originalSaleId: data.originalSaleId,
          customerId: data.customerId,
          returnDate: new Date(),
          reason: data.reason,
          refundMethod: data.refundMethod,
          bankAccountId: data.bankAccountId,
          totalRefund: totalRefund.toFixed(2),
          approvedBy: userId,
          receivedBy: userId,
          documentNumber: docNumber.formatted,
          notes: data.notes,
        })
        .returning()

      for (const detail of planned) {
        const [line] = await tx
          .insert(shopReturnLines)
          .values({
            shopReturnId: shopReturn.id,
            itemId: detail.itemId,
            variantId: detail.variantId,
            shopStockId: null,
            quantity: detail.quantity,
            unitRefundPriceUgx: detail.unitRefund.toFixed(2),
            unitCostUgx: detail.unitCost.toFixed(2),
            totalRefundUgx: detail.totalRefund.toFixed(2),
          })
          .returning()

        for (const alloc of detail.allocations) {
          await tx.insert(shopReturnLineAllocations).values({
            shopReturnLineId: line.id,
            shopStockId: alloc.shopStockId,
            supplyRouteLineId: alloc.supplyRouteLineId,
            quantity: alloc.quantity,
            costPerUnitUgx: alloc.costPerUnitUgx,
          })
          await tx
            .update(shopStock)
            .set({
              quantityOnHand: sql`${shopStock.quantityOnHand} + ${alloc.quantity}`,
            })
            .where(eq(shopStock.id, alloc.shopStockId))
        }
      }

      // For credit_adjustment refunds, look up the original sale and
      // guard against over-refunding before posting any journal entry.
      let originalSale: typeof shopSales.$inferSelect | undefined
      if (data.refundMethod === 'credit_adjustment' && data.originalSaleId) {
        originalSale = await tx.query.shopSales.findFirst({
          where: eq(shopSales.id, data.originalSaleId),
        })
        if (originalSale) {
          validateCreditAdjustmentRefund({
            totalRefund: totalRefund.toFixed(2),
            outstandingBalance: originalSale.outstandingBalance,
          })
        }
      }

      const refundCreditCategory =
        data.refundMethod === 'credit_adjustment'
          ? 'Accounts Receivable'
          : data.refundMethod === 'cash'
            ? 'Cash'
            : 'Bank'

      await postJournalEntry(tx, {
        entries: [
          {
            type: 'debit',
            category: 'Sales Returns',
            amount: totalRefund.toFixed(2),
          },
          {
            type: 'credit',
            category: refundCreditCategory,
            amount: totalRefund.toFixed(2),
          },
        ],
        referenceType: 'shop_return',
        referenceId: shopReturn.id,
        locationType: 'shop',
        locationId: data.shopId,
        depositLocation:
          data.refundMethod === 'cash'
            ? 'cash'
            : data.refundMethod === 'bank'
              ? 'bank'
              : undefined,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `Refund ${docNumber.formatted}: ${data.reason}`,
      })

      if (totalCost.gt(0)) {
        await postJournalEntry(tx, {
          entries: [
            {
              type: 'debit',
              category: 'Inventory - Shop',
              amount: totalCost.toFixed(2),
            },
            {
              type: 'credit',
              category: 'Cost of Goods Sold',
              amount: totalCost.toFixed(2),
            },
          ],
          referenceType: 'shop_return',
          referenceId: shopReturn.id,
          locationType: 'shop',
          locationId: data.shopId,
          recordedBy: userId,
          description: `Return COGS reversal ${docNumber.formatted}`,
        })
      }

      if (data.refundMethod === 'credit_adjustment' && data.originalSaleId) {
        const sale = originalSale
        if (sale && isPaymentStatusOpen(sale.paymentStatus)) {
          const newBalance = BigNumber.maximum(
            new BigNumber(sale.outstandingBalance).minus(totalRefund),
            new BigNumber(0),
          ).toFixed(2)
          await tx
            .update(shopSales)
            .set({
              outstandingBalance: newBalance,
              paymentStatus: computeNewSaleStatus(newBalance),
            })
            .where(eq(shopSales.id, data.originalSaleId))
        }
      }

      const shop = await tx.query.shops.findFirst({
        where: eq(shops.id, data.shopId),
      })
      const actorName = await getActorName(tx, userId)
      const articleNumbers = await resolveArticleNumbersForAudit(tx, {
        action: 'shopReturn.create',
        entityType: 'shop_return',
        entityId: shopReturn.id,
        metadata: null,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: 'shopReturn.create',
        entityType: 'shop_return',
        entityId: shopReturn.id,
        description: renderAuditDescription('shopReturn.create', {
          actorName,
          shopName: shop?.name,
          itemCount: data.items.length,
        }),
        articleNumbers,
        after: {
          shopId: data.shopId,
          documentNumber: docNumber.formatted,
          refundMethod: data.refundMethod,
          totalRefundUgx: totalRefund.toFixed(2),
          customerId: data.customerId,
          originalSaleId: data.originalSaleId,
          reason: data.reason,
        },
        metadata: {
          itemCount: data.items.length,
          totalCostUgx: totalCost.toFixed(2),
          bankAccountId: data.bankAccountId,
        },
      })

      return shopReturn
    })
  })
