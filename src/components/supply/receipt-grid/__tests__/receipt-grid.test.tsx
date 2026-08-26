// @vitest-environment jsdom

import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isReceiptGridOutsideClick, ReceiptGrid } from '../receipt-grid'
import { createEmptyReceiptRow, isReceiptRowEmpty } from '../receipt-grid-state'
import type { ReceiptGridRow } from '../types'

vi.mock('@glideapps/glide-data-grid', () => ({
  DataEditor: (props: {
    rows: number
    cellActivationBehavior?: string
    editOnType?: boolean
    onCellClicked?: (
      cell: readonly [number, number],
      event: { preventDefault: () => void },
    ) => void
    onCellActivated?: (cell: readonly [number, number]) => void
    onCellEdited?: (
      cell: readonly [number, number],
      value: { data: string },
    ) => void
    onFillPattern?: (event: {
      patternSource: { x: number; y: number; width: number; height: number }
      fillDestination: { x: number; y: number; width: number; height: number }
      preventDefault: () => void
    }) => void
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'grid-row-count',
        'data-activation': props.cellActivationBehavior,
        'data-edit-on-type': String(props.editOnType),
      },
      createElement('span', null, String(props.rows)),
      createElement('input', { 'aria-label': 'Mock editor input' }),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            props.onCellClicked?.([1, 0], { preventDefault: () => undefined }),
        },
        'Mock append row',
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.onCellActivated?.([1, props.rows - 1]),
        },
        'Mock activate blank row',
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => props.onCellEdited?.([1, 0], { data: 'Jacket' }),
        },
        'Mock edit design',
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            props.onCellClicked?.([0, 0], { preventDefault: () => undefined }),
        },
        'Mock delete row',
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            props.onFillPattern?.({
              patternSource: { x: 1, y: 0, width: 1, height: 1 },
              fillDestination: { x: 1, y: 0, width: 1, height: 3 },
              preventDefault: () => undefined,
            }),
        },
        'Mock fill down',
      ),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () =>
            props.onFillPattern?.({
              patternSource: { x: 2, y: 0, width: 1, height: 1 },
              fillDestination: { x: 2, y: 0, width: 1, height: 2 },
              preventDefault: () => undefined,
            }),
        },
        'Mock fill colour',
      ),
    ),
  GridCellKind: { Text: 'text' },
}))
vi.mock('../design-cell-editor', () => ({ DesignCellEditor: () => null }))
vi.mock('../color-cell-editor', () => ({ ColorCellEditor: () => null }))
vi.mock('../size-cell-editor', () => ({ SizeCellEditor: () => null }))

const initialRow = (): ReceiptGridRow => createEmptyReceiptRow('row-1')

function Harness({ filled = false }: { filled?: boolean }) {
  const [rows, setRows] = useState<ReceiptGridRow[]>([
    {
      ...initialRow(),
      design: filled ? 'Jacket' : '',
      itemId: filled ? 'item-1' : null,
      catalogItem: filled
        ? {
            id: 'item-1',
            name: 'Jacket',
            design: 'Jacket',
            articleNumbers: [],
            colors: [],
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
  return createElement(
    'div',
    null,
    createElement(ReceiptGrid, { rows, onRowsChange: setRows }),
    createElement(
      'output',
      { 'data-testid': 'grid-state' },
      JSON.stringify(rows),
    ),
  )
}

describe('ReceiptGrid row actions', () => {
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

  it('adds a row when the blank buffer row is clicked', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock append row' }))

    expect(screen.getByTestId('grid-row-count').textContent).toContain('2')
  })

  it('adds a row when the blank buffer row is activated', () => {
    render(<Harness />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Mock activate blank row' }),
    )

    expect(screen.getByTestId('grid-row-count').textContent).toContain('2')
  })

  it('shows a button for adding receipt lines', () => {
    render(<Harness />)

    expect(
      screen.getByRole('button', { name: 'Add receipt line' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add receipt line' }))

    expect(screen.getByTestId('grid-row-count').textContent).toContain('2')
  })

  it('deletes a row and restores it with the history Undo button', () => {
    render(<Harness filled />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock delete row' }))
    expect(screen.getByTestId('grid-row-count').textContent).toContain('0')
    expect(
      screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled'),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByTestId('grid-row-count').textContent).toContain('1')
  })

  it('undoes and redoes a table edit locally', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock edit design' }))
    expect(screen.getByTestId('grid-state').textContent).toContain('Jacket')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByTestId('grid-state').textContent).not.toContain('Jacket')

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(screen.getByTestId('grid-state').textContent).toContain('Jacket')
  })

  it('supports Ctrl+Z and Ctrl+Shift+Z for table history', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock edit design' }))
    const grid = screen.getByTestId('grid-row-count')
    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true })
    expect(screen.getByTestId('grid-state').textContent).not.toContain('Jacket')

    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(screen.getByTestId('grid-state').textContent).toContain('Jacket')
  })

  it('leaves native text-field undo shortcuts alone', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock edit design' }))
    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Mock editor input' }),
      {
        key: 'z',
        ctrlKey: true,
      },
    )

    expect(screen.getByTestId('grid-state').textContent).toContain('Jacket')
  })

  it('grows the grid when fill-down reaches below the last row', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock fill down' }))

    expect(screen.getByTestId('grid-row-count').textContent).toContain('4')
  })

  it('copies into new rows and leaves a fresh buffer after fill-down', () => {
    render(<Harness filled />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock fill down' }))

    const state = JSON.parse(
      String(screen.getByTestId('grid-state').textContent),
    ) as ReceiptGridRow[]
    expect(state).toHaveLength(4)
    expect(state.slice(0, 3).map((item) => item.design)).toEqual([
      'Jacket',
      'Jacket',
      'Jacket',
    ])
    expect(isReceiptRowEmpty(state[3])).toBe(true)
  })

  it('selects on first click and keeps typing-to-edit enabled', () => {
    render(<Harness />)

    const grid = screen.getByTestId('grid-row-count')
    expect(grid.getAttribute('data-activation')).toBe('second-click')
    expect(grid.getAttribute('data-edit-on-type')).toBe('true')
  })

  it('copies colour metadata when filling a selected colour cell', () => {
    render(<Harness filled />)

    fireEvent.click(screen.getByRole('button', { name: 'Mock fill colour' }))

    const state = String(screen.getByTestId('grid-state').textContent)
    expect(state).toContain('"colorText":"Red"')
    expect(state).toContain('"colorHexText":"#ff0000"')
    expect(state).toContain('"colorIds":["red-1"]')
  })
})
