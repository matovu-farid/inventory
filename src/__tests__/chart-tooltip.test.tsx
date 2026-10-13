import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChartContainer, ChartTooltipContent } from '#/components/ui/chart'

describe('chart tooltips', () => {
  it('renders a date label even when that date is not a chart configuration key', () => {
    const html = renderToStaticMarkup(
      <ChartContainer
        config={{ revenue: { label: 'Sales (UGX)', color: 'var(--chart-1)' } }}
      >
        <ChartTooltipContent
          active
          label="2026-10-13"
          payload={[
            {
              graphicalItemId: 'revenue',
              name: 'revenue',
              dataKey: 'revenue',
              value: 180000,
            },
          ]}
        />
      </ChartContainer>,
    )
    expect(html).toContain('2026-10-13')
    expect(html).toContain('180,000')
  })

  it('renders a location name without requiring the location to be a configuration key', () => {
    const html = renderToStaticMarkup(
      <ChartContainer
        config={{ quantity: { label: 'Units', color: 'var(--chart-1)' } }}
      >
        <ChartTooltipContent
          active
          label="Main warehouse"
          payload={[
            {
              graphicalItemId: 'quantity',
              name: 'quantity',
              dataKey: 'quantity',
              value: 34,
            },
          ]}
        />
      </ChartContainer>,
    )
    expect(html).toContain('Main warehouse')
    expect(html).toContain('Units')
  })
})
