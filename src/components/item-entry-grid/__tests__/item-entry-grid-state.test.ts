import { describe, expect, it } from 'vitest'
import {
  calculateItemEntryGridTotals,
  copyItemEntryRowField,
  createEmptyItemEntryRow,
  fillDownItemEntryCells,
  updateItemEntryCell,
  validateItemEntryRows,
} from '../item-entry-grid-state'
import type { ItemEntryRow } from '../types'

const row = (
  id: string,
  overrides: Partial<ItemEntryRow> = {},
): ItemEntryRow => ({
  ...createEmptyItemEntryRow(id),
  ...overrides,
})

describe('item entry grid state', () => {
  it('creates a row with opening-safe defaults', () => {
    expect(createEmptyItemEntryRow('row-1')).toMatchObject({
      itemName: '',
      design: '',
      articleNumber: '',
      quantity: null,
      unitPriceForeign: '',
      minimumSellPriceUgx: '',
      lowStockThreshold: 0,
      colorIds: [],
    })
  })

  it('fills down a value beyond the last row and leaves a trailing blank row', () => {
    const next = fillDownItemEntryCells(
      [row('one', { articleNumber: 'JKT-1' })],
      { row: 0, column: 'articleNumber' },
      [1, 2],
    )

    expect(next.map((entry) => entry.articleNumber)).toEqual([
      'JKT-1',
      'JKT-1',
      'JKT-1',
    ])
    expect(next.at(-1)?.id).not.toBe('one')
  })

  it('fills down a quantity together with an independent distribution', () => {
    const source = row('one', {
      quantity: 5,
      distribution: {
        mode: 'colors',
        cells: [{ color: 'Red', quantity: 5 }],
      },
    })
    const copied = copyItemEntryRowField(source, 'quantity')

    expect(copied).toEqual({
      quantity: 5,
      distribution: {
        mode: 'colors',
        cells: [{ color: 'Red', quantity: 5 }],
      },
    })
    expect(copied.distribution).not.toBe(source.distribution)
    expect(copied.distribution?.cells).not.toBe(source.distribution?.cells)
  })

  it('parses quantity and threshold as non-negative whole numbers', () => {
    expect(
      updateItemEntryCell([row('one')], 0, 'quantity', '4')[0].quantity,
    ).toBe(4)
    expect(
      updateItemEntryCell([row('one')], 0, 'lowStockThreshold', '')[0]
        .lowStockThreshold,
    ).toBe(0)
  })

  it('calculates mode-neutral totals from the shared cost field', () => {
    expect(
      calculateItemEntryGridTotals([
        row('one', { quantity: 4, unitPriceForeign: '12500' }),
      ]),
    ).toEqual({ totalPieces: 4, totalAmount: '50000.00' })
  })

  it('validates opening-balance rows with the shared rules', () => {
    expect(
      validateItemEntryRows(
        [row('one', { design: 'Round neck', articleNumber: 'T-1' })],
        'opening-balance',
      ),
    ).toBe('Opening-balance line 1: enter a quantity greater than zero')
    expect(
      validateItemEntryRows(
        [
          row('one', {
            design: 'Round neck',
            articleNumber: 'T-1',
            quantity: 4,
            unitPriceForeign: '12500',
          }),
        ],
        'opening-balance',
      ),
    ).toBeNull()
  })
})
