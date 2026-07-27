import { describe, it, expect } from 'vitest'
import { foreignToUgx, foreignToUsd } from '../lib/currency/conversion'

describe('foreignToUgx', () => {
  it('converts RMB to UGX via USD correctly', () => {
    // Example: 100 RMB, rate 7.2 RMB/USD, rate 3700 UGX/USD, qty 10
    // = (100 / 7.2) * 3700 * 10 = 513,888.89
    const result = foreignToUgx({
      unitPriceForeign: '100',
      exchangeRateForeignToUsd: '7.2',
      exchangeRateUsdToUgx: '3700',
      quantity: 10,
    })
    expect(result.toFixed(2)).toBe('513888.89')
  })

  it('handles single item quantity', () => {
    const result = foreignToUgx({
      unitPriceForeign: '50',
      exchangeRateForeignToUsd: '7.0',
      exchangeRateUsdToUgx: '3750',
      quantity: 1,
    })
    // 50 / 7.0 * 3750 * 1 = 26785.71
    expect(result.toFixed(2)).toBe('26785.71')
  })

  it('handles BHT currency', () => {
    const result = foreignToUgx({
      unitPriceForeign: '200',
      exchangeRateForeignToUsd: '35',
      exchangeRateUsdToUgx: '3700',
      quantity: 5,
    })
    // 200 / 35 * 3700 * 5 = 105714.29
    expect(result.toFixed(2)).toBe('105714.29')
  })

  it('rounds to 2 decimal places', () => {
    const result = foreignToUgx({
      unitPriceForeign: '33',
      exchangeRateForeignToUsd: '7.1',
      exchangeRateUsdToUgx: '3699',
      quantity: 3,
    })
    // Result should be precisely 2 decimal places
    expect(result.dp()).toBeLessThanOrEqual(2)
  })

  it('handles large quantities', () => {
    const result = foreignToUgx({
      unitPriceForeign: '15',
      exchangeRateForeignToUsd: '7.2',
      exchangeRateUsdToUgx: '3700',
      quantity: 10000,
    })
    expect(result.isFinite()).toBe(true)
    expect(result.gt(0)).toBe(true)
  })

  it('throws on zero exchange rate', () => {
    expect(() =>
      foreignToUgx({
        unitPriceForeign: '100',
        exchangeRateForeignToUsd: '0',
        exchangeRateUsdToUgx: '3700',
        quantity: 1,
      }),
    ).toThrow('must be positive')
  })

  it('throws on negative exchange rate', () => {
    expect(() =>
      foreignToUgx({
        unitPriceForeign: '100',
        exchangeRateForeignToUsd: '-7.2',
        exchangeRateUsdToUgx: '3700',
        quantity: 1,
      }),
    ).toThrow('must be positive')
  })
})

describe('foreignToUsd', () => {
  it('converts foreign currency to USD', () => {
    const result = foreignToUsd({
      amountForeign: '720',
      exchangeRateForeignToUsd: '7.2',
    })
    expect(result.toFixed(2)).toBe('100.00')
  })

  it('handles non-round results', () => {
    const result = foreignToUsd({
      amountForeign: '100',
      exchangeRateForeignToUsd: '7.2',
    })
    expect(result.toFixed(2)).toBe('13.89')
  })
})
