import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  validateDiscrepancyNotes,
  validateQuantityReceived,
} from '#/server/functions/store/receive-validate'

describe('validateQuantityReceived', () => {
  it('throws when received is negative', () => {
    expect(() => validateQuantityReceived(-1)).toThrow(/non-negative/i)
  })

  it('accepts zero', () => {
    expect(() => validateQuantityReceived(0)).not.toThrow()
  })

  it('accepts positive integers', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100_000 }), (received) => {
        expect(() => validateQuantityReceived(received)).not.toThrow()
      }),
    )
  })
})

describe('validateDiscrepancyNotes', () => {
  it('does nothing when received >= expected', () => {
    expect(() =>
      validateDiscrepancyNotes({
        quantityExpected: 100,
        quantityReceived: 100,
      }),
    ).not.toThrow()
    expect(() =>
      validateDiscrepancyNotes({
        quantityExpected: 100,
        quantityReceived: 105,
      }),
    ).not.toThrow()
  })

  it('throws when received < expected and notes are missing', () => {
    expect(() =>
      validateDiscrepancyNotes({
        quantityExpected: 100,
        quantityReceived: 90,
      }),
    ).toThrow(/discrepancy/i)
  })

  it('throws when received < expected and notes are blank/whitespace', () => {
    expect(() =>
      validateDiscrepancyNotes({
        quantityExpected: 100,
        quantityReceived: 90,
        discrepancyNotes: '   ',
      }),
    ).toThrow(/discrepancy/i)
    expect(() =>
      validateDiscrepancyNotes({
        quantityExpected: 100,
        quantityReceived: 90,
        discrepancyNotes: null,
      }),
    ).toThrow(/discrepancy/i)
  })

  it('passes when received < expected and notes are provided', () => {
    expect(() =>
      validateDiscrepancyNotes({
        quantityExpected: 100,
        quantityReceived: 90,
        discrepancyNotes: '10 boxes held at customs',
      }),
    ).not.toThrow()
  })
})
