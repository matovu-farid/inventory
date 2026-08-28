import { describe, expect, it } from 'vitest'
import {
  applyPasteMatrix,
  addReceiptRow,
  calculateGridTotals,
  calculateRowAmount,
  createEmptyReceiptRow,
  fillDownReceiptCells,
  isReceiptRowEmpty,
  removeReceiptRow,
  stripEmptyReceiptRows,
  validateReceiptRows,
  updateReceiptCell,
} from '../receipt-grid-state'
import type { ReceiptGridRow } from '../types'

const row = (
  id: string,
  overrides: Partial<ReceiptGridRow> = {},
): ReceiptGridRow => ({
  ...createEmptyReceiptRow(id),
  ...overrides,
})

describe('receipt grid state', () => {
  it('defaults commercial settings and copies them with a row', () => {
    const empty = createEmptyReceiptRow('empty')
    expect(empty).toMatchObject({
      minimumSellPriceUgx: '',
      lowStockThreshold: 0,
    })
    expect(isReceiptRowEmpty(empty)).toBe(true)

    const filled = row('filled', {
      minimumSellPriceUgx: '12000',
      lowStockThreshold: 5,
    })
    expect(isReceiptRowEmpty(filled)).toBe(false)
    expect(filled).toMatchObject({
      minimumSellPriceUgx: '12000',
      lowStockThreshold: 5,
    })
  })

  it('calculates a row amount from quantity and unit price', () => {
    expect(
      calculateRowAmount(row('1', { quantity: 100, unitPriceForeign: '31' })),
    ).toBe('3100.00')
  })

  it('calculates amount from the distributed quantity when the row is bottom-up', () => {
    const bottomUpRow = row('1', {
      quantity: null,
      unitPriceForeign: '31',
      distribution: {
        mode: 'colors',
        cells: [
          { color: 'Black', quantity: 40 },
          { color: 'Red', quantity: 60 },
        ],
      },
    })

    expect(calculateRowAmount(bottomUpRow)).toBe('3100.00')
    expect(calculateGridTotals([bottomUpRow])).toEqual({
      totalPieces: 100,
      totalAmountForeign: '3100.00',
    })
  })

  it('updates a cell without mutating the original row', () => {
    const original = row('1')
    const next = updateReceiptCell([original], 0, 'design', 'Cotton Shirt')

    expect(next[0].design).toBe('Cotton Shirt')
    expect(original.design).toBe('')
  })

  it('recognizes and strips wholly empty rows before saving', () => {
    const rows = [
      row('blank'),
      row('complete', {
        design: 'Jacket',
        quantity: 10,
        unitPriceForeign: '31',
      }),
    ]

    expect(isReceiptRowEmpty(rows[0])).toBe(true)
    expect(isReceiptRowEmpty(rows[1])).toBe(false)
    expect(stripEmptyReceiptRows(rows).map((item) => item.id)).toEqual([
      'complete',
    ])
  })

  it('removes one row without mutating the remaining row objects', () => {
    const rows = [row('first'), row('second'), row('third')]

    expect(removeReceiptRow(rows, 1).map((item) => item.id)).toEqual([
      'first',
      'third',
    ])
    expect(rows).toHaveLength(3)
  })

  it('adds an editable row before the trailing blank buffer', () => {
    const rows = [row('filled', { design: 'Jacket' }), row('buffer')]

    const next = addReceiptRow(rows)

    expect(next).toHaveLength(3)
    expect(next[0].id).toBe('filled')
    expect(isReceiptRowEmpty(next[1])).toBe(true)
    expect(isReceiptRowEmpty(next[2])).toBe(true)
    expect(next[1].id).not.toBe(next[2].id)
    expect(rows).toHaveLength(2)
  })

  it('validates incomplete non-empty rows while allowing empty colour and size', () => {
    expect(
      validateReceiptRows([
        row('blank'),
        row('missing-price', {
          design: 'Jacket',
          articleNumber: 'JKT-1',
          quantity: 10,
        }),
      ]),
    ).toBe('Receipt line 2: enter a unit price')

    expect(
      validateReceiptRows([
        row('valid', {
          design: 'Jacket',
          articleNumber: 'JKT-1',
          quantity: 10,
          unitPriceForeign: '31',
        }),
      ]),
    ).toBeNull()
  })

  it('fills a selected cell down and grows rows beyond the current grid', () => {
    const rows = [row('1', { articleNumber: 'KBO345' })]
    const next = fillDownReceiptCells(
      rows,
      { row: 0, column: 'articleNumber' },
      [1, 2, 3],
    )

    expect(next).toHaveLength(4)
    expect(next.map((item) => item.articleNumber)).toEqual([
      'KBO345',
      'KBO345',
      'KBO345',
      'KBO345',
    ])
  })

  it('pastes a tabular matrix into the selected cell and recalculates amounts', () => {
    const rows = [row('1'), row('2')]
    const next = applyPasteMatrix(rows, { row: 0, column: 'quantity' }, [
      ['100', '31'],
      ['200', '28'],
    ])

    expect(next[0]).toMatchObject({ quantity: 100, unitPriceForeign: '31' })
    expect(next[1]).toMatchObject({ quantity: 200, unitPriceForeign: '28' })
    expect(calculateRowAmount(next[1])).toBe('5600.00')
  })

  it('copies commercial settings when filling cells down', () => {
    const rows = [
      row('1', { minimumSellPriceUgx: '12000', lowStockThreshold: 5 }),
    ]
    const next = fillDownReceiptCells(
      rows,
      { row: 0, column: 'minimumSellPriceUgx' },
      [1],
    )

    expect(next[1]).toMatchObject({
      minimumSellPriceUgx: '12000',
      lowStockThreshold: 0,
    })

    const thresholdNext = fillDownReceiptCells(
      rows,
      { row: 0, column: 'lowStockThreshold' },
      [1],
    )
    expect(thresholdNext[1].lowStockThreshold).toBe(5)
  })
})
