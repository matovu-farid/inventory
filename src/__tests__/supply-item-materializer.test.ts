import { describe, expect, it } from 'vitest'
import {
  calculateSupplyLineAmounts,
  materializeVariantRows,
} from '#/server/functions/supply/items-internals'

const baseInput = {
  supplyRouteId: '00000000-0000-4000-8000-000000000001',
  itemId: '00000000-0000-4000-8000-000000000002',
  supplierId: '00000000-0000-4000-8000-000000000003',
  unitPriceForeign: '10',
  foreignCurrency: 'RMB',
  exchangeRateForeignToUsd: '7.25',
  exchangeRateUsdToUgx: '3750',
  minimumSellPriceUgx: '20000',
  cells: [{ quantity: 2 }],
}

describe('materializeVariantRows exchange-rate validation', () => {
  it('rejects a negative foreign-to-USD rate', () => {
    expect(() =>
      materializeVariantRows({
        ...baseInput,
        exchangeRateForeignToUsd: '-7.25',
      }),
    ).toThrow(/exchange rate must be positive/i)
  })

  it('rejects a negative USD-to-UGX rate', () => {
    expect(() =>
      materializeVariantRows({
        ...baseInput,
        exchangeRateUsdToUgx: '-3750',
      }),
    ).toThrow(/exchange rate must be positive/i)
  })

  it('uses the same validated conversion for quantity recalculation', () => {
    expect(
      calculateSupplyLineAmounts({
        quantity: 3,
        unitPriceForeign: '10',
        foreignCurrency: 'RMB',
        exchangeRateForeignToUsd: '7.25',
        exchangeRateUsdToUgx: '3750',
      }),
    ).toEqual({
      totalAmountForeign: '30.00',
      totalAmountUsd: '4.14',
      totalCostUgx: '15517.24',
    })
  })

  it('keeps purchase-label snapshots on materialized rows', () => {
    const [row] = materializeVariantRows({
      ...baseInput,
      supplierNameSnapshot: 'Supplier at purchase',
      articleNumberSnapshot: 'ARTICLE-001',
      itemNameSnapshot: 'Item at purchase',
    })

    expect(row).toMatchObject({
      supplierNameSnapshot: 'Supplier at purchase',
      articleNumberSnapshot: 'ARTICLE-001',
      itemNameSnapshot: 'Item at purchase',
    })
  })
})
