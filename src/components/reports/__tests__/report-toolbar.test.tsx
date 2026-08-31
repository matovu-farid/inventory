// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReportToolbar } from '#/components/reports/report-toolbar'

afterEach(cleanup)

function renderToolbar(
  overrides: Partial<React.ComponentProps<typeof ReportToolbar>> = {},
) {
  return render(
    <ReportToolbar
      from=""
      to=""
      onApply={vi.fn()}
      onClear={vi.fn()}
      onPrint={vi.fn()}
      onExportCsv={vi.fn()}
      {...overrides}
    />,
  )
}

describe('ReportToolbar', () => {
  it('renders labeled date and report actions', () => {
    renderToolbar()

    expect(screen.getByRole('button', { name: 'From date' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'To date' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Print' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy()
  })

  it('blocks an inverted range and explains the problem', () => {
    renderToolbar({ from: '2026-08-31', to: '2026-08-01' })

    expect(
      screen.getByText('Start date must be on or before end date.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('clears the current range and prints through callbacks', () => {
    const onClear = vi.fn()
    const onPrint = vi.fn()
    renderToolbar({ from: '2026-08-01', to: '2026-08-31', onClear, onPrint })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(onClear).toHaveBeenCalledOnce()
    expect(onPrint).toHaveBeenCalledOnce()
  })
})
