// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isReceiptGridOutsideClick, ReceiptGrid } from '../receipt-grid'
import { createEmptyReceiptRow, isReceiptRowEmpty } from '../receipt-grid-state'
import type { ReceiptGridRow } from '../types'

vi.mock('#/server/functions/items/items', () => ({
  getItemByArticle: vi.fn().mockResolvedValue(null),
  searchItems: vi.fn().mockResolvedValue([]),
}))

vi.mock('#/server/functions/supply/items', () => ({
  splitSupplyRouteItem: vi.fn().mockResolvedValue(null),
}))

function Harness({ filled = false }: { filled?: boolean }) {
  const [rows, setRows] = useState<ReceiptGridRow[]>([
    {
      ...createEmptyReceiptRow('row-1'),
      design: filled ? 'Jacket' : '',
      itemId: filled ? 'item-1' : null,
      catalogItem: filled
        ? {
            id: 'item-1',
            name: 'Jacket',
            design: 'Jacket',
            articleNumbers: [],
            colors: [],
            minimumSellPriceUgx: '0',
            lowStockThreshold: 0,
          }
        : null,
      articleNumber: filled ? 'JKT-1' : '',
      colorText: filled ? 'Red' : '',
      colorHexText: filled ? '#ff0000' : '',
      colorIds: filled ? ['red-1'] : [],
      sizeText: filled ? 'S, M' : '',
      quantity: filled ? 10 : null,
      unitPriceForeign: filled ? '3.00' : '',
      distribution: filled
        ? {
            mode: 'colors',
            cells: [{ color: 'Red', colorId: 'red-1', colorHex: '#ff0000', quantity: 10 }],
          }
        : null,
    },
  ])
  return (
    <>
      <ReceiptGrid rows={rows} onRowsChange={setRows} />
      <output data-testid="grid-state">{JSON.stringify(rows)}</output>
    </>
  )
}

describe('custom ReceiptGrid', () => {
  afterEach(cleanup)

  it('keeps portalled picker interactions inside the active editor', () => {
    const popover = document.createElement('div')
    popover.dataset.slot = 'popover-content'
    const picker = document.createElement('div')
    popover.appendChild(picker)
    document.body.appendChild(popover)
    let result: boolean | undefined
    picker.addEventListener('mousedown', (event) => {
      result = isReceiptGridOutsideClick(event)
    })
    picker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(result).toBe(false)
    popover.remove()
  })

  it('adds a new editable row when the blank buffer row is focused', async () => {
    render(<Harness />)
    fireEvent.focus(screen.getByRole('textbox', { name: 'Art No.' }))
    await waitFor(() =>
      expect(document.querySelectorAll('[data-receipt-row]').length).toBe(2),
    )
  })

  it('shows a button for adding receipt lines', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Add receipt line' }))
    expect(document.querySelectorAll('[data-receipt-row]').length).toBe(2)
  })

  it('deletes a row and restores it with the history Undo button', () => {
    render(<Harness filled />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete receipt line 1' }),
    )
    expect(document.querySelectorAll('[data-receipt-row]').length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(document.querySelectorAll('[data-receipt-row]').length).toBe(1)
  })

  it('undoes and redoes a committed table edit locally', async () => {
    render(<Harness />)
    const articleNumber = screen.getByRole('textbox', { name: 'Art No.' })
    fireEvent.change(articleNumber, { target: { value: 'JKT-1' } })
    fireEvent.blur(articleNumber)
    await waitFor(() =>
      expect(screen.getByTestId('grid-state').textContent).toContain('JKT-1'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByTestId('grid-state').textContent).not.toContain('JKT-1')
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(screen.getByTestId('grid-state').textContent).toContain('JKT-1')
  })

  it('supports Ctrl+Z and Ctrl+Shift+Z for table history', async () => {
    render(<Harness />)
    const articleNumber = screen.getByRole('textbox', { name: 'Art No.' })
    fireEvent.change(articleNumber, { target: { value: 'JKT-1' } })
    fireEvent.blur(articleNumber)
    await waitFor(() =>
      expect(screen.getByTestId('grid-state').textContent).toContain('JKT-1'),
    )
    const grid = screen.getByTestId('receipt-grid')
    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true })
    expect(screen.getByTestId('grid-state').textContent).not.toContain('JKT-1')
    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(screen.getByTestId('grid-state').textContent).toContain('JKT-1')
  })

  it('keeps the amount and row values readable', () => {
    render(<Harness filled />)
    expect(screen.getByTestId('grid-state').textContent).toContain('Jacket')
    expect(screen.getAllByText('30.00').length).toBeGreaterThan(0)
    expect(isReceiptRowEmpty(createEmptyReceiptRow('empty'))).toBe(true)
  })

  it('does not round a receipt unit price as a UGX minimum sell price', async () => {
    render(<Harness />)
    const unitPrice = screen.getByRole('textbox', { name: 'Unit Price' })

    fireEvent.change(unitPrice, { target: { value: '28' } })
    fireEvent.blur(unitPrice)

    await waitFor(() =>
      expect(screen.getByTestId('grid-state').textContent).toContain(
        'unitPriceForeign":"28',
      ),
    )
  })

  it('locks the aggregate quantity while keeping distribution editing available', () => {
    render(<Harness filled />)

    const quantity = screen.getByRole('spinbutton', { name: 'Qty (pcs)' })
    expect(quantity.getAttribute('readonly')).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Distribute quantity for row 1',
      }).getAttribute('disabled'),
    ).toBeNull()

    fireEvent.change(quantity, { target: { value: '8' } })
    expect(screen.getByTestId('grid-state').textContent).toContain(
      '"quantity":10',
    )
  })

  it('keeps an undistributed quantity editable', () => {
    render(<Harness />)

    expect(
      screen.getByRole('spinbutton', { name: 'Qty (pcs)' }).getAttribute(
        'readonly',
      ),
    ).toBeNull()
  })

  it('unlocks quantity only after clearing its distribution', async () => {
    render(<Harness filled />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Distribute quantity for row 1' }),
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear distribution' }))

    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: 'Qty (pcs)' }).getAttribute(
          'readonly',
        ),
      ).toBeNull(),
    )
    expect(screen.getByTestId('grid-state').textContent).toContain(
      '"distribution":null',
    )
  })
})
