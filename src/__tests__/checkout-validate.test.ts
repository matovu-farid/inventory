import { describe, it, expect } from 'vitest'
import { validateCartForCheckout } from '#/lib/pos/checkout-validate'
import type { ValidationIssue } from '#/lib/pos/checkout-validate'
import type { CartItem } from '#/lib/pos/cart-reducer'

const base: CartItem = {
  shopStockId: 'stk1',
  itemId: 'itm1',
  variantId: 'var1',
  itemLabel: 'TR-001 Tee',
  imageUrl: null,
  colorHex: '#000',
  qty: 1,
  unitPriceUgx: '50000',
  minimumSellPriceUgx: '50000',
  belowMinimumReason: '',
  availableQty: 5,
}

describe('validateCartForCheckout', () => {
  it('rejects empty cart', () => {
    const r = validateCartForCheckout([])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0].code).toBe('empty')
  })

  it('rejects zero or negative price', () => {
    const r = validateCartForCheckout([{ ...base, unitPriceUgx: '0' }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const i = r.issues.find((x: ValidationIssue) => x.code === 'price')
      expect(i?.shopStockId).toBe('stk1')
    }
  })

  it('rejects qty exceeding available', () => {
    const r = validateCartForCheckout([{ ...base, qty: 99 }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.some((x) => x.code === 'qty')).toBe(true)
    }
  })

  it('requires reason when price below minimum', () => {
    const r = validateCartForCheckout([
      { ...base, unitPriceUgx: '30000', belowMinimumReason: '' },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.some((x) => x.code === 'reason')).toBe(true)
    }
  })

  it('accepts below-min with non-empty reason', () => {
    const r = validateCartForCheckout([
      { ...base, unitPriceUgx: '30000', belowMinimumReason: 'haggled' },
    ])
    expect(r.ok).toBe(true)
  })

  it('passes for valid cart', () => {
    const r = validateCartForCheckout([base])
    expect(r.ok).toBe(true)
  })
})
