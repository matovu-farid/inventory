import { isPaymentStatusOpen } from "#/lib/payment-status"
import type { PaymentStatus } from "#/lib/payment-status"

export interface Thresholds {
  lowStockUnits: number
  discrepancyPercent: number
  overdueDays: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  lowStockUnits: 5,
  discrepancyPercent: 10,
  overdueDays: 30,
}

export function shouldNotifyLowStock(
  quantityOnHand: number,
  thresholds: Thresholds,
): boolean {
  return quantityOnHand <= thresholds.lowStockUnits
}

export function shouldNotifyDiscrepancy(
  systemQuantity: number,
  discrepancy: number,
  thresholds: Thresholds,
): boolean {
  if (systemQuantity === 0) return false
  const pct = Math.abs(discrepancy) / systemQuantity * 100
  return pct >= thresholds.discrepancyPercent
}

export type CreditSaleStatus = PaymentStatus

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function shouldNotifyOverdueCredit(
  saleDate: Date,
  status: CreditSaleStatus,
  now: Date,
  thresholds: Thresholds,
): boolean {
  if (!isPaymentStatusOpen(status)) return false
  const ageDays = (now.getTime() - saleDate.getTime()) / MS_PER_DAY
  return ageDays > thresholds.overdueDays
}
