// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SupplyRouteReview } from '#/components/supply/supply-route-review'
import type { SupplyRouteReviewLineInput } from '#/lib/supply-route-review'

afterEach(cleanup)

const lines: SupplyRouteReviewLineInput[] = [
  {
    date: '2026-01-13',
    supplierName: 'Cathy',
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
    date: '2026-01-13',
    supplierName: 'Cathy',
    articleNumber: 'JMP-001',
    itemName: 'Plain Jumper',
    colorName: 'Black',
    size: 'L',
    quantity: 5,
    unitPriceForeign: '32.75',
    foreignCurrency: 'RMB',
    exchangeRateForeignToUsd: '7.25',
    exchangeRateUsdToUgx: '3750',
    totalAmountForeign: '163.75',
    totalAmountUsd: '22.5862069',
    totalCostUgx: '84700',
    minimumSellPriceUgx: '25000',
  },
]

describe('SupplyRouteReview item accordion', () => {
  it('shows item totals in the trigger and reveals variants on expansion', () => {
    render(<SupplyRouteReview lines={lines} expenses={[]} />)

    const itemTrigger = screen.getByRole('button', { name: /Plain Jumper/ })
    expect(itemTrigger).toBeTruthy()
    expect(itemTrigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(itemTrigger)

    expect(itemTrigger.getAttribute('aria-expanded')).toBe('true')
    expect(
      document
        .querySelector('[data-slot="accordion-content"]')
        ?.getAttribute('data-state'),
    ).toBe('open')
    expect(screen.getByText('Black · M')).toBeTruthy()
    expect(screen.getByText('Black · L')).toBeTruthy()

    fireEvent.click(itemTrigger)

    expect(itemTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps items closed when lines arrive after the initial empty render', () => {
    const { rerender } = render(<SupplyRouteReview lines={[]} expenses={[]} />)

    rerender(<SupplyRouteReview lines={lines} expenses={[]} />)

    const itemTrigger = screen.getByRole('button', { name: /Plain Jumper/ })
    expect(itemTrigger.getAttribute('aria-expanded')).toBe('false')
  })
})
