import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import {
  customerPayments,
  customerPaymentApplications,
  customers,
  shopSales,
} from "#/db/schema"
import {
  allocatePaymentFifo,
  computeNewSaleStatus,
} from "#/lib/credit/payment-allocation"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { nextDocumentNumber } from "#/lib/document-numbers-db"
import { recordAuditLog } from "#/server/middleware/audit-store"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { OPEN_PAYMENT_STATUSES } from "#/lib/payment-status"
import { depositCategoryFor } from "#/lib/payment-method"
import { formatUgxTotal } from "#/lib/format"

const recordPaymentInput = z.object({
  customerId: z.uuid(),
  shopId: z.uuid(),
  amount: z.string(),
  paymentMethod: z.enum(["cash", "bank"]),
  bankAccountId: z.uuid().optional(),
  notes: z.string().optional(),
})

/**
 * Record a payment from a credit customer.
 *
 * Allocates the payment FIFO across the customer's open sales, updates
 * each affected sale's outstanding balance and payment status, and posts
 * the journal entry: DR Cash/Bank / CR Accounts Receivable.
 */
export const recordPayment = createServerFn()
  .inputValidator(recordPaymentInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])
    const userId = session.user.id

    const amount = new BigNumber(data.amount)
    if (amount.lte(0)) throw new Error("Payment amount must be positive")

    return db.transaction(async (tx) => {
      const customer = await tx.query.customers.findFirst({
        where: and(eq(customers.id, data.customerId)),
      })
      if (!customer || customer.deletedAt) {
        throw new Error(`Customer not found: ${data.customerId}`)
      }

      const openSales = await tx.query.shopSales.findMany({
        where: and(
          eq(shopSales.customerId, data.customerId),
          inArray(shopSales.paymentStatus, OPEN_PAYMENT_STATUSES),
        ),
        orderBy: (s, { asc }) => [asc(s.saleDate)],
      })

      const allocation = allocatePaymentFifo(
        openSales.map((s) => ({
          id: s.id,
          outstandingBalance: s.outstandingBalance,
          saleDate: s.saleDate,
        })),
        amount.toFixed(2),
      )

      if (new BigNumber(allocation.unallocated).gt(0)) {
        throw new Error(
          `Payment of ${formatUgxTotal(amount)} exceeds outstanding balance by ${formatUgxTotal(allocation.unallocated)}`,
        )
      }

      const docNumber = await nextDocumentNumber(tx, "PAY")
      const [payment] = await tx
        .insert(customerPayments)
        .values({
          customerId: data.customerId,
          shopId: data.shopId,
          paymentDate: new Date(),
          amount: amount.toFixed(2),
          paymentMethod: data.paymentMethod,
          bankAccountId: data.bankAccountId,
          receivedBy: userId,
          documentNumber: docNumber.formatted,
          notes: data.notes,
        })
        .returning()

      // Apply allocations and update each sale
      for (const alloc of allocation.allocations) {
        await tx.insert(customerPaymentApplications).values({
          customerPaymentId: payment.id,
          shopSaleId: alloc.shopSaleId,
          amountApplied: alloc.amountApplied,
        })

        const sale = openSales.find((s) => s.id === alloc.shopSaleId)
        if (!sale) throw new Error(`Sale not found: ${alloc.shopSaleId}`)
        const newBalance = new BigNumber(sale.outstandingBalance)
          .minus(alloc.amountApplied)
          .toFixed(2)
        await tx
          .update(shopSales)
          .set({
            outstandingBalance: newBalance,
            paymentStatus: computeNewSaleStatus(newBalance),
          })
          .where(eq(shopSales.id, alloc.shopSaleId))
      }

      // Post ledger entry
      await postJournalEntry(tx, {
        entries: [
          {
            type: "debit",
            category: depositCategoryFor(data.paymentMethod),
            amount: amount.toFixed(2),
          },
          {
            type: "credit",
            category: "Accounts Receivable",
            amount: amount.toFixed(2),
          },
        ],
        referenceType: "customer_payment",
        referenceId: payment.id,
        locationType: "shop",
        locationId: data.shopId,
        depositLocation: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `Payment ${docNumber.formatted} from ${customer.name}`,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "customerPayment.record",
        entityType: "customer_payment",
        entityId: payment.id,
        after: {
          customerId: data.customerId,
          shopId: data.shopId,
          documentNumber: docNumber.formatted,
          amountUgx: amount.toFixed(2),
          paymentMethod: data.paymentMethod,
        },
        metadata: {
          allocationCount: allocation.allocations.length,
          bankAccountId: data.bankAccountId,
        },
      })

      return { payment, allocations: allocation.allocations }
    })
  })

const writeOffBadDebtInput = z.object({
  saleId: z.uuid(),
  reason: z.string().min(1),
})

/**
 * Write off an uncollectible credit sale (Admin only).
 * Posts: DR Bad Debt Expense / CR Accounts Receivable for the
 * remaining balance, sets paymentStatus=written_off, zeroes the
 * outstandingBalance.
 */
export const writeOffBadDebt = createServerFn()
  .inputValidator(writeOffBadDebtInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const sale = await tx.query.shopSales.findFirst({
        where: eq(shopSales.id, data.saleId),
      })
      if (!sale) throw new Error(`Sale not found: ${data.saleId}`)
      if (sale.paymentMethod !== "credit") {
        throw new Error("Only credit sales can be written off as bad debt")
      }
      if (sale.paymentStatus === "settled" || sale.paymentStatus === "written_off") {
        throw new Error(
          `Sale ${sale.documentNumber ?? sale.id} is ${sale.paymentStatus}; cannot write off`,
        )
      }

      const remaining = new BigNumber(sale.outstandingBalance)
      if (remaining.lte(0)) {
        throw new Error("No outstanding balance to write off")
      }

      await tx
        .update(shopSales)
        .set({
          outstandingBalance: "0",
          paymentStatus: "written_off",
        })
        .where(eq(shopSales.id, data.saleId))

      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: "Bad Debt Expense", amount: remaining.toFixed(2) },
          { type: "credit", category: "Accounts Receivable", amount: remaining.toFixed(2) },
        ],
        referenceType: "bad_debt_writeoff",
        referenceId: data.saleId,
        locationType: "shop",
        locationId: sale.shopId,
        recordedBy: userId,
        description: `Bad debt write-off: ${data.reason}`,
      })

      await recordAuditLog(tx, {
        actorUserId: userId,
        action: "customerPayment.writeOff",
        entityType: "shop_sale",
        entityId: data.saleId,
        before: {
          paymentStatus: sale.paymentStatus,
          outstandingBalance: sale.outstandingBalance,
        },
        after: {
          paymentStatus: "written_off",
          outstandingBalance: "0",
        },
        metadata: {
          customerId: sale.customerId,
          shopId: sale.shopId,
          documentNumber: sale.documentNumber,
          writtenOffAmountUgx: remaining.toFixed(2),
          reason: data.reason,
        },
      })

      return { ok: true, writtenOff: remaining.toFixed(2) }
    })
  })
