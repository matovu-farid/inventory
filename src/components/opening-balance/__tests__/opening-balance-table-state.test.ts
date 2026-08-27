import { describe, expect, it } from 'vitest'
import {
  addOpeningBalanceRow,
  calculateOpeningBalanceRowAmount,
  createEmptyOpeningBalanceRow,
  fillDownOpeningBalanceCells,
  groupOpeningBalanceRows,
  isOpeningBalanceRowEmpty,
  validateOpeningBalanceRows,
} from '../opening-balance-table-state'
import type { OpeningBalanceTableRow } from '../opening-balance-table-state'

const item = {
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
    {
      id: 'color-black',
      colorName: 'Black',
      colorHex: '#000000',
      imageS3Key: null,
    },
  ],
  variants: [
    { id: 'variant-red-m', colorId: 'color-red', size: 'M' },
    { id: 'variant-black-m', colorId: 'color-black', size: 'M' },
  ],
  minimumSellPriceUgx: '28000',
  lowStockThreshold: 0,
}

function row(overrides: Partial<OpeningBalanceTableRow> = {}) {
  return {
    ...createEmptyOpeningBalanceRow('row-1'),
    item,
    itemId: item.id,
    colorId: 'color-red',
    size: 'M',
    quantity: 10,
    unitCostUgx: '12500',
    minimumSellPriceUgx: '28000',
    lowStockThreshold: 0,
    ...overrides,
  }
}

describe('opening balance table state', () => {
  it('creates a blank row and adds a new blank row after populated data', () => {
    const empty = createEmptyOpeningBalanceRow('empty')
    expect(isOpeningBalanceRowEmpty(empty)).toBe(true)
    expect(addOpeningBalanceRow([row()])).toHaveLength(2)
    expect(isOpeningBalanceRowEmpty(addOpeningBalanceRow([row()])[1])).toBe(
      true,
    )
  })

  it('calculates row amount from quantity and unit cost', () => {
    expect(calculateOpeningBalanceRowAmount(row())).toBe('125000.00')
    expect(calculateOpeningBalanceRowAmount(row({ unitCostUgx: '' }))).toBe('')
  })

  it('validates required fields and colour/size pairs', () => {
    expect(
      validateOpeningBalanceRows([createEmptyOpeningBalanceRow('x')]),
    ).toBe('Add at least one opening-balance line')
    expect(validateOpeningBalanceRows([row({ size: '' })])).toMatch(
      /colour and size/i,
    )
    expect(
      validateOpeningBalanceRows([row({ item: null, itemId: null })]),
    ).toMatch(/select an item/i)
  })

  it('groups rows by item and emits existing or materialisable variants', () => {
    const rows = [
      row(),
      row({ id: 'row-2', colorId: 'color-black', size: 'M', quantity: 4 }),
    ]
    expect(groupOpeningBalanceRows(rows)).toEqual([
      {
        itemId: 'item-1',
        unitCostUgx: '12500.00',
        minimumSellPriceUgx: '28000.00',
        lowStockThreshold: 0,
        cells: [
          { variantId: 'variant-red-m', quantity: 10 },
          { variantId: 'variant-black-m', quantity: 4 },
        ],
      },
    ])
  })

  it('rejects duplicate item and variant rows before submission', () => {
    expect(() =>
      groupOpeningBalanceRows([row(), row({ id: 'row-2', quantity: 5 })]),
    ).toThrow(/duplicate/i)
  })

  it('fills a selected cell down and creates rows past the current end', () => {
    const filled = fillDownOpeningBalanceCells(
      [row(), createEmptyOpeningBalanceRow('blank')],
      { row: 0, column: 'unitCostUgx' },
      [1, 2, 3],
    )
    expect(filled).toHaveLength(4)
    expect(filled.slice(1).map((entry) => entry.unitCostUgx)).toEqual([
      '12500',
      '12500',
      '12500',
    ])
  })

  it('carries item context when filling a colour into a new row', () => {
    const filled = fillDownOpeningBalanceCells(
      [row(), createEmptyOpeningBalanceRow('blank')],
      { row: 0, column: 'color' },
      [1],
    )
    expect(filled[1]).toMatchObject({
      itemId: item.id,
      colorId: 'color-red',
      size: '',
      quantity: null,
      unitCostUgx: '',
    })
  })

  it('resets stale lot values when filling a different item', () => {
    const otherItem = { ...item, id: 'item-2', name: 'Other item' }
    const filled = fillDownOpeningBalanceCells(
      [
        row(),
        row({
          id: 'row-2',
          item: otherItem,
          itemId: otherItem.id,
          quantity: 4,
          unitCostUgx: '9999',
        }),
      ],
      { row: 0, column: 'item' },
      [1],
    )
    expect(filled[1]).toMatchObject({
      itemId: item.id,
      quantity: null,
      unitCostUgx: '',
    })
  })
})
