import { describe, expect, it } from 'vitest'
import {
  buildSupplyRouteReview,
  groupSupplyRouteReviewLines,
} from '#/lib/supply-route-review'
import type {
  SupplyRouteReviewExpenseInput,
  SupplyRouteReviewLineInput,
} from '#/lib/supply-route-review'

const lines: SupplyRouteReviewLineInput[] = [
  {
    date: '2026-01-13',
    supplierName: 'RMB Supplier',
    articleNumber: 'JMP-001',
    itemName: 'Plain Jumper',
    colorName: 'Black',
    size: 'M',
    quantity: 10,
    unitPriceForeign: '32.75',
    foreignCurrency: 'RMB',
    exchangeRateForeignToUsd: '7.25',
    exchangeRateUsdToUgx: '3750',
    totalAmountForeign: '327.50',
    totalAmountUsd: '45.17241379',
    totalCostUgx: '169400',
    minimumSellPriceUgx: '25000',
  },
  {
    supplierName: 'Dollar Supplier',
    articleNumber: 'TEE-002',
    itemName: 'Basic Tee',
    quantity: 2,
    unitPriceForeign: '10',
    foreignCurrency: 'USD',
    exchangeRateUsdToUgx: '3750',
    totalAmountForeign: '20',
    totalAmountUsd: '20',
    totalCostUgx: '75000',
    minimumSellPriceUgx: '50000',
  },
]

const expenses: SupplyRouteReviewExpenseInput[] = [
  {
    category: 'freight',
    description: 'Courier charge',
    amount: '10',
    currency: 'USD',
    exchangeRate: '3750',
  },
]

describe('buildSupplyRouteReview', () => {
  it('aggregates source spend, total cost, selling value, expenses, gross profit, and net profit', () => {
    const summary = buildSupplyRouteReview(lines, expenses)

    expect(summary.totals.units).toBe(12)
    expect(summary.totals.sourceSpend.RMB.toFixed(2)).toBe('327.50')
    expect(summary.totals.sourceSpend.USD.toFixed(2)).toBe('20.00')
    expect(summary.totals.sourceSpend.UGX.toFixed(2)).toBe('0.00')
    expect(summary.totals.itemCostUgx.toFixed(2)).toBe('244400.00')
    expect(summary.totals.expenseTotalUgx.toFixed(2)).toBe('37500.00')
    expect(summary.totals.expenseByCategory.freight.toFixed(2)).toBe('37500.00')
    expect(summary.totals.totalCostUgx.toFixed(2)).toBe('281900.00')
    expect(summary.totals.totalUsdEquivalent.toFixed(2)).toBe('65.17')
    expect(summary.totals.totalSellingValueUgx.toFixed(2)).toBe('350000.00')
    expect(summary.totals.grossProfitUgx.toFixed(2)).toBe('105600.00')
    expect(summary.totals.netProfitUgx.toFixed(2)).toBe('68100.00')
  })

  it('preserves supplier, item, variant, source cost, rates, and line profit details', () => {
    const summary = buildSupplyRouteReview(lines)
    const [line] = summary.lines

    expect(line.supplierName).toBe('RMB Supplier')
    expect(line.date).toBe('2026-01-13')
    expect(line.articleNumber).toBe('JMP-001')
    expect(line.itemName).toBe('Plain Jumper')
    expect(line.colorName).toBe('Black')
    expect(line.size).toBe('M')
    expect(line.sourceUnitCost.toFixed(2)).toBe('32.75')
    expect(line.sourceCurrency).toBe('RMB')
    expect(line.totalAmountUsd?.toFixed(2)).toBe('45.17')
    expect(line.exchangeRateForeignToUsd?.toFixed(2)).toBe('7.25')
    expect(line.exchangeRateUsdToUgx?.toFixed(2)).toBe('3750.00')
    expect(line.unitCostUgx.toFixed(2)).toBe('16940.00')
    expect(line.grossProfitUgx.toFixed(2)).toBe('80600.00')
  })

  it('counts UGX source spend and keeps UGX rates absent', () => {
    const summary = buildSupplyRouteReview([
      {
        ...lines[0],
        foreignCurrency: 'UGX',
        exchangeRateForeignToUsd: null,
        exchangeRateUsdToUgx: null,
        totalAmountForeign: '169400',
        totalCostUgx: '169400',
      },
    ])

    expect(summary.totals.sourceSpend.UGX.toFixed(2)).toBe('169400.00')
    expect(summary.lines[0].exchangeRateForeignToUsd).toBeNull()
    expect(summary.lines[0].exchangeRateUsdToUgx).toBeNull()
  })

  it('uses safe labels for missing relations and preserves negative profit', () => {
    const summary = buildSupplyRouteReview([
      {
        quantity: 1,
        unitPriceForeign: '20',
        foreignCurrency: 'UGX',
        totalAmountForeign: '20000',
        totalCostUgx: '20000',
        minimumSellPriceUgx: '10000',
      },
    ])

    expect(summary.lines[0].supplierName).toBe('Unknown supplier')
    expect(summary.lines[0].itemName).toBe('Item')
    expect(summary.lines[0].grossProfitUgx.toFixed(2)).toBe('-10000.00')
    expect(summary.totals.grossProfitUgx.toFixed(2)).toBe('-10000.00')
    expect(summary.totals.netProfitUgx.toFixed(2)).toBe('-10000.00')
  })

  it('excludes invalid expense conversions from projected net profit', () => {
    const summary = buildSupplyRouteReview(
      [lines[0]],
      [{ category: 'tax', amount: '10', currency: 'USD' }],
    )

    expect(summary.totals.grossProfitUgx.toFixed(2)).toBe('80600.00')
    expect(summary.totals.expenseTotalUgx.toFixed(2)).toBe('0.00')
    expect(summary.totals.netProfitUgx.toFixed(2)).toBe('80600.00')
    expect(summary.totals.missingExpenseConversions).toBe(1)
  })

  it('rounds converted route expenses exactly like the ledger conversion', () => {
    const summary = buildSupplyRouteReview(
      [],
      [
        {
          category: 'tax',
          amount: '1.005',
          currency: 'USD',
          exchangeRate: '1',
        },
      ],
    )

    expect(summary.expenses[0].convertedAmountUgx?.toFixed(0)).toBe('1')
    expect(summary.totals.expenseTotalUgx.toFixed(0)).toBe('1')
  })

  it('excludes invalid foreign expense conversions and reports them', () => {
    const summary = buildSupplyRouteReview(
      [],
      [
        {
          category: 'tax',
          amount: '10',
          currency: 'USD',
        },
        {
          category: 'shipping',
          amount: '-5',
          currency: 'UGX',
        },
      ],
    )

    expect(summary.totals.expenseTotalUgx.toFixed(0)).toBe('0')
    expect(summary.totals.missingExpenseConversions).toBe(2)
  })

  it('does not present a missing or non-positive sell price as a real price', () => {
    const summary = buildSupplyRouteReview([
      {
        quantity: 1,
        unitPriceForeign: '20',
        foreignCurrency: 'UGX',
        totalAmountForeign: '20000',
        totalCostUgx: '20000',
        minimumSellPriceUgx: '0',
      },
    ])

    expect(summary.lines[0].minimumSellPriceUgx).toBeNull()
    expect(summary.totals.totalSellingValueUgx.toFixed(0)).toBe('0')
  })

  it('reports source spend entered in an unsupported currency instead of hiding it', () => {
    const summary = buildSupplyRouteReview([
      {
        quantity: 1,
        unitPriceForeign: '100',
        foreignCurrency: 'BHT',
        totalAmountForeign: '100',
        totalCostUgx: '10000',
        minimumSellPriceUgx: '20000',
      },
    ])

    expect(summary.totals.unsupportedSourceSpend.BHT.toFixed(0)).toBe('100')
    expect(summary.totals.sourceSpend.UGX.toFixed(0)).toBe('0')
  })
})

describe('groupSupplyRouteReviewLines', () => {
  it('groups variants under their item while preserving item totals', () => {
    const summary = buildSupplyRouteReview([
      lines[0],
      {
        ...lines[0],
        colorName: 'Black',
        size: 'L',
        quantity: 5,
        totalAmountForeign: '163.75',
        totalAmountUsd: '22.5862069',
        totalCostUgx: '84700',
        minimumSellPriceUgx: '25000',
      },
      lines[1],
    ])

    const groups = groupSupplyRouteReviewLines(summary.lines)

    expect(groups).toHaveLength(2)
    expect(groups[0].itemName).toBe('Plain Jumper')
    expect(groups[0].lines).toHaveLength(2)
    expect(groups[0].units).toBe(15)
    expect(groups[0].itemCostUgx.toFixed(0)).toBe('254100')
    expect(groups[0].sellingValueUgx.toFixed(0)).toBe('375000')
    expect(groups[0].grossProfitUgx.toFixed(0)).toBe('120900')
    expect(groups[0].supplierNames).toEqual(['RMB Supplier'])
  })
})
