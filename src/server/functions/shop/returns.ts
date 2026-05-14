import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  shopReturns,
  shopReturnItems,
  shopStock,
  shopSales,
  customers,
} from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { nextDocumentNumber } from "#/lib/document-numbers-db"
import { computeNewSaleStatus } from "#/lib/credit/payment-allocation"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { validateCreditAdjustmentRefund } from "./refund-validate"

const returnItemInput = z.object({
  shopStockId: z.uuid(),
  quantity: z.number().int().positive(),
  unitRefundPriceUgx: z.string(),
})

const recordCustomerReturnInput = z.object({
  shopId: z.uuid(),
  originalSaleId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  reason: z.string().min(1),
  refundMethod: z.enum(["cash", "bank", "credit_adjustment"]),
  bankAccountId: z.uuid().optional(),
  items: z.array(returnItemInput).min(1),
  notes: z.string().optional(),
})

/**
 * Record a customer returning goods to a shop. Admin/Supervisor approval
 * required. Returned items go back to sellable shop stock. The journal posts:
 *   DR Sales Returns (contra-revenue) / CR Cash | Bank | A/R
 *   DR Inventory - Shop / CR Cost of Goods Sold
 */
export const recordCustomerReturn = createServerFn()
  .inputValidator(recordCustomerReturnInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    if (data.refundMethod === "credit_adjustment" && !data.customerId) {
      throw new Error("customerId is required for credit_adjustment refunds")
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

      const itemDetails: Array<{
        stockId: string
        quantity: number
        unitRefund: BigNumber
        totalRefund: BigNumber
        unitCost: BigNumber
        totalCost: BigNumber
      }> = []
      for (const item of data.items) {
        const stock = await tx.query.shopStock.findFirst({
          where: eq(shopStock.id, item.shopStockId),
        })
        if (!stock) throw new Error(`Stock item not found: ${item.shopStockId}`)
        const unitRefund = new BigNumber(item.unitRefundPriceUgx)
        const totalRefundForItem = unitRefund.times(item.quantity)
        const costPerUnit = new BigNumber(stock.costPerUnitUgx)
        const totalCostForItem = costPerUnit.times(item.quantity)

        totalRefund = totalRefund.plus(totalRefundForItem)
        totalCost = totalCost.plus(totalCostForItem)

        itemDetails.push({
          stockId: stock.id,
          quantity: item.quantity,
          unitRefund,
          totalRefund: totalRefundForItem,
          unitCost: costPerUnit,
          totalCost: totalCostForItem,
        })
      }

      const docNumber = await nextDocumentNumber(tx, "RET")
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

      // Create return-item rows and re-stock the returned items
      for (const detail of itemDetails) {
        await tx.insert(shopReturnItems).values({
          shopReturnId: shopReturn.id,
          shopStockId: detail.stockId,
          quantity: detail.quantity,
          unitRefundPriceUgx: detail.unitRefund.toFixed(2),
          unitCostUgx: detail.unitCost.toFixed(2),
          totalRefundUgx: detail.totalRefund.toFixed(2),
        })

        await tx
          .update(shopStock)
          .set({
            quantityOnHand: sql`${shopStock.quantityOnHand} + ${detail.quantity}`,
          })
          .where(eq(shopStock.id, detail.stockId))
      }

      // For credit_adjustment refunds, look up the original sale and guard
      // against over-refunding before posting any journal entry.
      let originalSale:
        | typeof shopSales.$inferSelect
        | undefined
      if (
        data.refundMethod === "credit_adjustment" &&
        data.originalSaleId
      ) {
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

      // Refund leg
      const refundCreditCategory =
        data.refundMethod === "credit_adjustment"
          ? "Accounts Receivable"
          : data.refundMethod === "cash"
            ? "Cash"
            : "Bank"

      await postJournalEntry(tx, {
        entries: [
          {
            type: "debit",
            category: "Sales Returns",
            amount: totalRefund.toFixed(2),
          },
          {
            type: "credit",
            category: refundCreditCategory,
            amount: totalRefund.toFixed(2),
          },
        ],
        referenceType: "shop_return",
        referenceId: shopReturn.id,
        locationType: "shop",
        locationId: data.shopId,
        depositLocation:
          data.refundMethod === "cash"
            ? "cash"
            : data.refundMethod === "bank"
              ? "bank"
              : undefined,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `Refund ${docNumber.formatted}: ${data.reason}`,
      })

      // COGS reversal — returned goods go back to sellable inventory
      if (totalCost.gt(0)) {
        await postJournalEntry(tx, {
          entries: [
            {
              type: "debit",
              category: "Inventory - Shop",
              amount: totalCost.toFixed(2),
            },
            {
              type: "credit",
              category: "Cost of Goods Sold",
              amount: totalCost.toFixed(2),
            },
          ],
          referenceType: "shop_return",
          referenceId: shopReturn.id,
          locationType: "shop",
          locationId: data.shopId,
          recordedBy: userId,
          description: `Return COGS reversal ${docNumber.formatted}`,
        })
      }

      // For credit_adjustment refunds against an open credit sale, reduce
      // that sale's outstanding balance and update its status.
      if (
        data.refundMethod === "credit_adjustment" &&
        data.originalSaleId
      ) {
        const sale = originalSale
        if (
          sale &&
          (sale.paymentStatus === "open" || sale.paymentStatus === "partially_paid")
        ) {
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

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "shopReturn.create",
        entityType: "shop_return",
        entityId: shopReturn.id,
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
