// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { OpeningBalanceTable } from '../opening-balance-table'
import {
  createEmptyOpeningBalanceRow,
  rowForOpeningBalanceItem,
} from '../opening-balance-table-state'
import type { OpeningBalanceTableRow } from '../opening-balance-table-state'

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView = () => {}

const item = vi.hoisted(() => ({
  id: 'item-1',
  name: 'Press Jacket',
  design: 'Jacket',
  articleNumbers: [{ id: 'article-1', articleNumber: 'JACKET 678' }],
  colors: [
    {
      id: 'color-red',
      colorName: 'Red',
      colorHex: '#ff0000',
      imageS3Key: null,
    },
  ],
  variants: [{ id: 'variant-red-m', colorId: 'color-red', size: 'M' }],
  minimumSellPriceUgx: '28000',
  lowStockThreshold: 0,
}))

vi.mock('#/server/functions/items/items', () => ({
  searchItems: vi.fn().mockResolvedValue([item]),
}))

function Harness({ initialRows }: { initialRows?: OpeningBalanceTableRow[] }) {
  const [rows, setRows] = useState(
    initialRows ?? [createEmptyOpeningBalanceRow('row-1')],
  )
  return <OpeningBalanceTable rows={rows} onRowsChange={setRows} />
}

describe('OpeningBalanceTable', () => {
  afterEach(cleanup)

  it('searches and displays a selected catalog item with commercial columns', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Item row 1' }))
    fireEvent.change(
      screen.getByPlaceholderText('Type article number, design, or item name…'),
      { target: { value: 'JACKET 678' } },
    )
    const option = await screen.findByRole('option', { name: /JACKET 678/ })
    fireEvent.click(option)

    expect(screen.getByText('Press Jacket')).toBeTruthy()
    expect(screen.getByText('Jacket')).toBeTruthy()
    expect(screen.getByText('JACKET 678')).toBeTruthy()
    expect(
      screen.getByLabelText('Minimum sell price row 1').getAttribute('value'),
    ).toBe('28,000')
    expect(
      screen.getByLabelText('Low-stock threshold row 1').getAttribute('value'),
    ).toBe('0')
  })

  it('keeps an always-visible add button and creates a row when the trailing row is focused', async () => {
    const populated = rowForOpeningBalanceItem('row-1', item)
    render(
      <Harness
        initialRows={[populated, createEmptyOpeningBalanceRow('row-2')]}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Add opening balance line' }),
    ).toBeTruthy()
    fireEvent.focus(screen.getByLabelText('Quantity row 2'))
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-opening-balance-row]').length,
      ).toBe(3),
    )
  })

  it('edits colour, size, quantity, cost, amount, and deletes a line', async () => {
    render(
      <Harness
        initialRows={[
          rowForOpeningBalanceItem('row-1', item),
          createEmptyOpeningBalanceRow('row-2'),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Colour row 1' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Red' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Size row 1' }))
    fireEvent.click(await screen.findByRole('option', { name: 'M' }))
    fireEvent.change(screen.getByLabelText('Quantity row 1'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Unit cost row 1'), {
      target: { value: '12500' },
    })

    expect(screen.getByText('125,000')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete opening balance line 1' }),
    )
    expect(screen.getByRole('combobox', { name: 'Item row 1' })).toBeTruthy()
  })
})
