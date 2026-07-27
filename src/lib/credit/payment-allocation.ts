import BigNumber from 'bignumber.js'
import type { PaymentStatus } from '#/lib/payment-status'

export type { PaymentStatus }

export interface OpenSale {
  id: string
  outstandingBalance: string
  saleDate: Date
}

export interface Allocation {
  shopSaleId: string
  amountApplied: string
}

export interface AllocationResult {
  allocations: Allocation[]
  unallocated: string
}

/**
 * Allocate a payment across open credit sales using FIFO by saleDate.
 *
 * - Sales are sorted ascending by saleDate; oldest is paid first.
 * - Sales with zero outstandingBalance are skipped.
 * - If the payment exceeds the total open balance, the remainder is
 *   reported in `unallocated` so the caller can decide whether to reject
 *   the payment or treat it as an over-payment.
 */
export function allocatePaymentFifo(
  openSales: OpenSale[],
  paymentAmount: string,
): AllocationResult {
  const payment = new BigNumber(paymentAmount)
  if (payment.lte(0)) {
    throw new Error('payment-allocation: amount must be positive')
  }

  const sorted = [...openSales]
    .filter((s) => new BigNumber(s.outstandingBalance).gt(0))
    .sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime())

  const allocations: Allocation[] = []
  let remaining = payment

  for (const sale of sorted) {
    if (remaining.lte(0)) break
    const balance = new BigNumber(sale.outstandingBalance)
    const apply = BigNumber.minimum(remaining, balance)
    allocations.push({
      shopSaleId: sale.id,
      amountApplied: apply.toFixed(2),
    })
    remaining = remaining.minus(apply)
  }

  return {
    allocations,
    unallocated: remaining.toFixed(2),
  }
}

/**
 * Compute the new payment status for a sale given its post-allocation balance.
 *
 * A balance of exactly zero means the sale is fully settled. Any positive
 * balance leaves it partially paid. Negative balances are rejected.
 *
 * The "open" and "written_off" statuses are owned elsewhere (initial credit
 * sale and bad-debt write-off respectively) and never returned from here.
 */
export function computeNewSaleStatus(
  postAllocationBalance: string,
): PaymentStatus {
  const balance = new BigNumber(postAllocationBalance)
  if (balance.lt(0)) {
    throw new Error('payment-allocation: balance cannot be negative')
  }
  return balance.isZero() ? 'settled' : 'partially_paid'
}
