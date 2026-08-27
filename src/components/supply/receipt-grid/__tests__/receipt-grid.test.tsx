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
  searchItems: vi.fn().mockResolvedValue([]),
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
})
