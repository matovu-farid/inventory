import { describe, it, expect } from 'vitest'
import BigNumber from 'bignumber.js'
import {
  computeOpeningBalanceTotal,
  validateOpeningBalanceCell,
} from '#/server/functions/admin/opening-balance-validate'

const VAR = '00000000-0000-0000-0000-000000000001'

describe('validateOpeningBalanceCell', () => {
  it('accepts a well-formed cell', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: VAR, quantity: 10 }, '15000'),
    ).not.toThrow()
  })

  it('rejects a missing variantId', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: '', quantity: 5 }, '1000'),
    ).toThrow(/variantId/i)
  })

  it('rejects zero or negative quantity', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: VAR, quantity: 0 }, '1000'),
    ).toThrow(/quantity/i)
    expect(() =>
      validateOpeningBalanceCell({ variantId: VAR, quantity: -3 }, '1000'),
    ).toThrow(/quantity/i)
  })

  it('rejects non-integer quantity', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: VAR, quantity: 1.5 }, '1000'),
    ).toThrow(/quantity/i)
  })

  it('rejects zero or negative unit cost', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: VAR, quantity: 5 }, '0'),
    ).toThrow(/unitCostUgx/i)
    expect(() =>
      validateOpeningBalanceCell({ variantId: VAR, quantity: 5 }, '-100'),
    ).toThrow(/unitCostUgx/i)
  })
})

describe('validateOpeningBalanceCell — colorId+size mode', () => {
  const COLOR = '00000000-0000-0000-0000-000000000002'

  it('accepts a colorId+size cell without variantId', () => {
    expect(() =>
      validateOpeningBalanceCell(
        { colorId: COLOR, size: 'M', quantity: 10 },
        '15000',
      ),
    ).not.toThrow()
  })

  it('accepts unresolved cells (variantId null, no pair)', () => {
    expect(() =>
      validateOpeningBalanceCell({ variantId: null, quantity: 5 }, '1000'),
    ).not.toThrow()
  })

  it('rejects variantId null combined with colorId+size', () => {
    expect(() =>
      validateOpeningBalanceCell(
        { variantId: null, colorId: COLOR, size: 'M', quantity: 5 },
        '1000',
      ),
    ).toThrow(/variantId null.*colorId/i)
  })

  it('rejects colorId without size', () => {
    expect(() =>
      validateOpeningBalanceCell({ colorId: COLOR, quantity: 5 }, '1000'),
    ).toThrow(/size/i)
  })
})

describe('computeOpeningBalanceTotal', () => {
  it('returns zero for an empty list', () => {
    expect(computeOpeningBalanceTotal([]).toFixed(2)).toBe('0.00')
  })

  it('multiplies cell quantities by entry unit cost and sums', () => {
    // Ported scenario: "two items with different costs" — one entry per
    // item, each with a single cell carrying the original quantity.
    const total = computeOpeningBalanceTotal([
      {
        itemId: 'p-1',
        unitCostUgx: '15000',
        cells: [{ variantId: VAR, quantity: 10 }],
      },
      {
        itemId: 'p-2',
        unitCostUgx: '2500.50',
        cells: [{ variantId: VAR, quantity: 3 }],
      },
    ])
    // 10 * 15000 + 3 * 2500.50 = 150000 + 7501.50 = 157501.50
    expect(total.toFixed(2)).toBe('157501.50')
  })

  it('preserves precision via BigNumber arithmetic', () => {
    const total = computeOpeningBalanceTotal([
      {
        itemId: 'p-1',
        unitCostUgx: '0.10',
        cells: [{ variantId: VAR, quantity: 3 }],
      },
      {
        itemId: 'p-2',
        unitCostUgx: '0.20',
        cells: [{ variantId: VAR, quantity: 3 }],
      },
    ])
    // 0.30 + 0.60 = 0.90 — would suffer from float drift if not BigNumber
    expect(total.eq(new BigNumber('0.90'))).toBe(true)
  })

  it('sums multiple cells within one product entry', () => {
    // New shape allows multiple variant cells under one item — they all
    // share the same unitCostUgx and contribute to the entry total.
    const total = computeOpeningBalanceTotal([
      {
        itemId: 'p-1',
        unitCostUgx: '10000',
        cells: [
          { variantId: VAR, quantity: 5 },
          { variantId: VAR, quantity: 3 },
        ],
      },
    ])
    // (5 + 3) * 10000 = 80000
    expect(total.toFixed(2)).toBe('80000.00')
  })
})
