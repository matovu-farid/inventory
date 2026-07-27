import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { BigNumber } from 'bignumber.js'
import { convertExpenseToUgx } from '#/server/functions/supply/expense-fx'

/**
 * Tests for BUG-2: addSupplyRouteExpense posts data.amount directly to the
 * ledger regardless of currency / exchangeRate. A USD 300 expense at rate
 * 3750 should post 1,125,000 UGX, not 300.
 *
 * Intended pure-helper API:
 *   convertExpenseToUgx({ amount, currency, exchangeRate? }) -> string
 *     - UGX input passes through (rate ignored)
 *     - Non-UGX input must have a positive exchangeRate; result = amount * rate
 *     - Throws when amount < 0
 *     - Throws when non-UGX without (positive) exchangeRate
 *     - Result is an integer-valued string (UGX has no decimals)
 */

describe('convertExpenseToUgx — examples (BUG-2)', () => {
  it('passes UGX amount through unchanged', () => {
    expect(convertExpenseToUgx({ amount: '5000', currency: 'UGX' })).toBe(
      '5000',
    )
  })

  it('ignores exchangeRate for UGX input', () => {
    expect(
      convertExpenseToUgx({
        amount: '5000',
        currency: 'UGX',
        exchangeRate: '3750',
      }),
    ).toBe('5000')
  })

  it('multiplies USD amount by exchangeRate', () => {
    expect(
      convertExpenseToUgx({
        amount: '300',
        currency: 'USD',
        exchangeRate: '3750',
      }),
    ).toBe('1125000')
  })

  it('throws when non-UGX currency has no exchangeRate', () => {
    expect(() =>
      convertExpenseToUgx({ amount: '300', currency: 'USD' }),
    ).toThrow(/(rate|exchange)/i)
  })

  it('throws when exchangeRate is zero', () => {
    expect(() =>
      convertExpenseToUgx({
        amount: '300',
        currency: 'USD',
        exchangeRate: '0',
      }),
    ).toThrow(/(rate|exchange|positive)/i)
  })

  it('throws when exchangeRate is negative', () => {
    expect(() =>
      convertExpenseToUgx({
        amount: '300',
        currency: 'USD',
        exchangeRate: '-1',
      }),
    ).toThrow(/(rate|exchange|positive|negative)/i)
  })

  it('throws when amount is negative', () => {
    expect(() =>
      convertExpenseToUgx({ amount: '-1', currency: 'UGX' }),
    ).toThrow(/(amount|negative|positive)/i)
  })

  it('supports RMB at rate', () => {
    expect(
      convertExpenseToUgx({
        amount: '100',
        currency: 'RMB',
        exchangeRate: '525',
      }),
    ).toBe('52500')
  })
})

describe('convertExpenseToUgx — property (BUG-2)', () => {
  it('USD output equals amount × rate exactly (integer math)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (amount, rate) => {
          const expected = new BigNumber(amount).multipliedBy(rate).toFixed(0)
          const actual = convertExpenseToUgx({
            amount: String(amount),
            currency: 'USD',
            exchangeRate: String(rate),
          })
          expect(actual).toBe(expected)
        },
      ),
    )
  })
})
