// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SupplyRouteReview } from '#/components/supply/supply-route-review'
import { TooltipProvider } from '#/components/ui/tooltip'
import type {
  SupplyRouteReviewExpenseInput,
  SupplyRouteReviewLineInput,
} from '#/lib/supply-route-review'

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

const expenses: SupplyRouteReviewExpenseInput[] = [
  {
    category: 'Freight',
    description: 'Container shipping',
    amount: '100',
    currency: 'USD',
    exchangeRate: '3750',
  },
]

function renderReview(props: ComponentProps<typeof SupplyRouteReview>) {
  return render(
    <TooltipProvider>
      <SupplyRouteReview {...props} />
    </TooltipProvider>,
  )
}

describe('SupplyRouteReview item accordion', () => {
  it('shows item totals in the trigger and reveals variants on expansion', () => {
    renderReview({ lines, expenses: [] })

    const itemTrigger = screen.getByRole('button', { name: /Plain Jumper/ })
    expect(itemTrigger).toBeTruthy()
    expect(itemTrigger.getAttribute('aria-expanded')).toBe('false')
    expect(itemTrigger.textContent).toContain('Selling total')
    expect(itemTrigger.textContent).toContain('375,000 UGX')

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
    const { rerender } = renderReview({ lines: [], expenses: [] })

    rerender(
      <TooltipProvider>
        <SupplyRouteReview lines={lines} expenses={[]} />
      </TooltipProvider>,
    )

    const itemTrigger = screen.getByRole('button', { name: /Plain Jumper/ })
    expect(itemTrigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows separate gross and projected net profit values', () => {
    renderReview({ lines, expenses })

    const summaryCard = screen
      .getByText('Route financial summary')
      .closest('[data-slot="card"]')
    expect(summaryCard).toBeTruthy()

    const grossLabel = screen.getByText(
      'Projected gross profit at minimum sell price',
    )
    const netLabel = screen.getByText(
      'Projected net profit at minimum sell price',
    )
    expect(summaryCard?.textContent).toContain('120,900 UGX')
    expect(summaryCard?.textContent).toContain('-254,100 UGX')
    expect(grossLabel.closest('p')?.nextElementSibling?.className).toContain(
      'text-emerald-700',
    )
    expect(netLabel.closest('p')?.nextElementSibling?.className).toContain(
      'text-destructive',
    )
  })

  it('explains review fields without nesting help buttons in the accordion trigger', () => {
    renderReview({
      lines,
      expenses,
      routeDetails: {
        name: 'China Trip — May 2026',
        departureDate: '2026-05-01',
        returnDate: '2026-05-10',
        budgetUsd: '10000',
        rateUgxPerUsd: '3750',
        rateRmbPerUsd: '7.25',
        notes: 'Compare freight quotes.',
        suppliers: ['Cathy'],
      },
    })

    expect(
      screen.getAllByRole('button', { name: 'What is Route?' }),
    ).toHaveLength(1)
    const totalCostHelp = screen.getByRole('button', {
      name: 'What is Total cost in UGX?',
    })
    expect(totalCostHelp).toBeTruthy()
    fireEvent.click(totalCostHelp)
    const totalCostDescription = screen.getByText(/Item Costs \+ Expenses/)
    expect(totalCostDescription).toBeTruthy()
    expect(totalCostDescription.parentElement?.className).toContain('text-xs')

    const itemTrigger = screen.getByRole('button', { name: /Plain Jumper/ })
    expect(itemTrigger.querySelectorAll('button')).toHaveLength(0)
    fireEvent.click(itemTrigger)

    expect(
      screen.getByRole('button', { name: 'What is Total selling?' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'What is Total UGX?' }),
    ).toBeTruthy()
  })
})
