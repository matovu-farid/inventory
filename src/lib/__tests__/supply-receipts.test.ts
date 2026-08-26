import { describe, expect, it } from 'vitest'
import {
  calculateReceiptTotals,
  findReceiptArtNumberConflict,
  groupLegacyLinesIntoReceipts,
  normalizeReceiptLookupText,
  normalizeReceiptSizes,
} from '../supply-receipts'
import {
  createEmptyReceiptRow,
  copyReceiptRow,
  fillDownReceiptCells,
  validateReceiptRows,
} from '#/components/supply/receipt-grid/receipt-grid-state'

describe('supply receipt helpers', () => {
  it('normalizes comma-separated sizes without duplicates', () => {
    expect(normalizeReceiptSizes(' S, M, s,  L ,, M ')).toEqual(['S', 'M', 'L'])
  })

  it('calculates receipt quantity and amount totals exactly', () => {
    expect(
      calculateReceiptTotals([
        { quantity: 100, unitPriceForeign: '31' },
        { quantity: 100, unitPriceForeign: '31.00' },
        { quantity: 0, unitPriceForeign: '' },
      ]),
    ).toEqual({ totalPieces: 200, totalAmountForeign: '6200.00' })
  })

  it('groups legacy entry lines into stable receipt groups', () => {
    expect(
      groupLegacyLinesIntoReceipts([
        {
          id: 'a',
          supplyRouteId: 'route',
          entryId: 'entry-1',
          supplierId: 's1',
        },
        {
          id: 'b',
          supplyRouteId: 'route',
          entryId: 'entry-1',
          supplierId: 's1',
        },
        {
          id: 'c',
          supplyRouteId: 'route',
          entryId: 'entry-2',
          supplierId: 's1',
        },
        {
          id: 'd',
          supplyRouteId: 'route',
          entryId: 'entry-1',
          supplierId: 's2',
        },
      ]),
    ).toEqual([
      { key: 'route|entry-1|s1', lineIds: ['a', 'b'] },
      { key: 'route|entry-2|s1', lineIds: ['c'] },
      { key: 'route|entry-1|s2', lineIds: ['d'] },
    ])
  })

  it('normalizes design and art-number lookups without changing display text', () => {
    expect(normalizeReceiptLookupText('  KBO3474  ')).toBe('kbo3474')
    expect(normalizeReceiptLookupText('  Press Jacket  ')).toBe('press jacket')
  })

  it('requires an art number on every non-empty receipt row', () => {
    expect(
      validateReceiptRows([
        {
          ...createEmptyReceiptRow('row-1'),
          design: 'Jacket',
          quantity: 10,
          unitPriceForeign: '3.00',
        },
      ]),
    ).toBe('Receipt line 1: enter an art number')
  })

  it('copies a receipt row including catalog and colour metadata', () => {
    const source = {
      ...createEmptyReceiptRow('source'),
      design: 'Jacket',
      itemId: 'item-1',
      catalogItem: {
        id: 'item-1',
        name: 'Jacket',
        design: 'Jacket',
        articleNumbers: [],
        colors: [],
      },
      articleNumber: 'KBO3474',
      colorText: 'Red',
      colorHexText: '#ff0000',
      colorIds: ['red-1'],
      sizeText: 'S, M',
      quantity: 10,
      unitPriceForeign: '3.00',
    }
    expect(copyReceiptRow(source, 'target')).toMatchObject({
      id: 'target',
      itemId: 'item-1',
      design: 'Jacket',
      articleNumber: 'KBO3474',
      colorText: 'Red',
      colorHexText: '#ff0000',
      colorIds: ['red-1'],
      sizeText: 'S, M',
    })
  })

  it('allows repeated art numbers for one design but rejects another design', () => {
    const rows = [
      {
        ...createEmptyReceiptRow('one'),
        design: 'Jacket',
        articleNumber: ' jkt-1 ',
        quantity: 1,
        unitPriceForeign: '3.00',
      },
      {
        ...createEmptyReceiptRow('two'),
        design: 'Jacket',
        articleNumber: 'JKT-1',
        quantity: 1,
        unitPriceForeign: '3.00',
      },
    ]
    const catalog = [
      { itemId: 'item-1', design: 'Jacket', articleNumbers: ['JKT-1'] },
    ]

    expect(findReceiptArtNumberConflict(rows, catalog)).toBeNull()
    expect(
      findReceiptArtNumberConflict(
        [{ ...rows[1], design: 'Trouser' }],
        catalog,
      ),
    ).toContain('belongs to design')
  })

  it('allows an art number owned by a duplicate catalog row with the same design', () => {
    const row = {
      ...createEmptyReceiptRow('row-1'),
      design: 'Jacket',
      articleNumber: 'JACKET 101',
      quantity: 1,
      unitPriceForeign: '34',
    }
    const catalog = [
      { itemId: 'item-old', design: 'Jacket', articleNumbers: [] },
      {
        itemId: 'item-owner',
        design: 'Jacket',
        articleNumbers: ['JACKET 101'],
      },
    ]

    expect(findReceiptArtNumberConflict([row], catalog)).toBeNull()
  })

  it('allows a same-design art number when the supplier also matches', () => {
    const row = {
      ...createEmptyReceiptRow('row-1'),
      design: 'Jacket',
      articleNumber: 'JACKET 101',
      quantity: 1,
      unitPriceForeign: '34',
    }
    const catalog = [
      {
        itemId: 'item-owner',
        design: 'Jacket',
        supplierId: 'supplier-selected',
        articleNumbers: ['JACKET 101'],
      },
    ]

    expect(
      findReceiptArtNumberConflict([row], catalog, 'supplier-selected'),
    ).toBeNull()
  })

  it('rejects a same-design art number owned by another supplier', () => {
    const row = {
      ...createEmptyReceiptRow('row-1'),
      design: 'Jacket',
      articleNumber: 'JACKET 101',
      quantity: 1,
      unitPriceForeign: '34',
    }
    const catalog = [
      {
        itemId: 'item-owner',
        design: 'Jacket',
        supplierId: 'supplier-other',
        articleNumbers: ['JACKET 101'],
      },
    ]

    expect(
      findReceiptArtNumberConflict([row], catalog, 'supplier-selected'),
    ).toContain('another supplier')
  })

  it('flags legacy case-variant art numbers with multiple owners', () => {
    const row = {
      ...createEmptyReceiptRow('legacy'),
      design: 'New design',
      articleNumber: 'legacy-1',
      quantity: 1,
      unitPriceForeign: '3.00',
    }
    expect(
      findReceiptArtNumberConflict(
        [row],
        [
          { itemId: 'item-1', design: 'Jacket', articleNumbers: ['LEGACY-1'] },
          { itemId: 'item-2', design: 'Trouser', articleNumbers: ['legacy-1'] },
        ],
      ),
    ).toContain('conflicting catalog ownership')
  })

  it('fills visible values and hidden metadata from an immutable source row', () => {
    const source = {
      ...createEmptyReceiptRow('source'),
      design: 'Jacket',
      itemId: 'item-1',
      catalogItem: {
        id: 'item-1',
        name: 'Jacket',
        design: 'Jacket',
        articleNumbers: [],
        colors: [],
      },
      articleNumber: 'JKT-1',
      colorText: 'Red',
      colorHexText: '#ff0000',
      colorIds: ['red-1'],
      sizeText: 'S, M',
      quantity: 10,
      unitPriceForeign: '3.00',
    }
    const filled = fillDownReceiptCells(
      [source, createEmptyReceiptRow('buffer')],
      { row: 0, column: 'design' },
      [1],
    )

    expect(filled[1]).toMatchObject({ design: 'Jacket', itemId: 'item-1' })
    const colorFilled = fillDownReceiptCells(
      [source, createEmptyReceiptRow('buffer')],
      { row: 0, column: 'colorText' },
      [1],
    )
    expect(colorFilled[1]).toMatchObject({
      colorText: 'Red',
      colorHexText: '#ff0000',
      colorIds: ['red-1'],
    })
  })
})
