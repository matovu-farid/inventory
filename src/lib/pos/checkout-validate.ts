import BigNumber from 'bignumber.js'
import type { CartItem } from './cart-reducer'

export type ValidationIssue =
  | { code: 'empty' }
  | { code: 'price'; shopStockId: string }
  | { code: 'qty'; shopStockId: string; available: number }
  | { code: 'reason'; shopStockId: string }

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] }

export function validateCartForCheckout(items: CartItem[]): ValidationResult {
  if (items.length === 0) return { ok: false, issues: [{ code: 'empty' }] }
  const issues: ValidationIssue[] = []
  for (const i of items) {
    const price = new BigNumber(i.unitPriceUgx || 0)
    if (!price.isFinite() || price.lte(0)) {
      issues.push({ code: 'price', shopStockId: i.shopStockId })
    }
    if (i.qty < 1 || i.qty > i.availableQty) {
      issues.push({
        code: 'qty',
        shopStockId: i.shopStockId,
        available: i.availableQty,
      })
    }
    if (
      price.isFinite() &&
      price.gt(0) &&
      price.lt(i.minimumSellPriceUgx) &&
      i.belowMinimumReason.trim().length === 0
    ) {
      issues.push({ code: 'reason', shopStockId: i.shopStockId })
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}
