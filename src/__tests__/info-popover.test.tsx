// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InfoPopover } from '#/components/ui/info-popover'

afterEach(cleanup)

describe('InfoPopover glossary API', () => {
  it('renders a glossary term in the shared clickable popover', () => {
    render(<InfoPopover term="kpi.grandTotal" />)

    const infoButton = screen.getByRole('button', {
      name: 'Help: kpi.grandTotal',
    })
    fireEvent.click(infoButton)

    const description = screen.getByText(/Item Costs \+ Expenses/)

    expect(description).toBeTruthy()
    expect(
      description.closest('[data-slot="popover-content"]')?.className,
    ).toContain('text-xs')
  })
})
