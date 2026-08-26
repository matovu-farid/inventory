import { describe, expect, it } from 'vitest'
import { receiptLineInput } from '../receipts.server'

describe('receipt line validation', () => {
  it('accepts one hex value for each comma-separated colour', () => {
    expect(() =>
      receiptLineInput.parse({
        design: 'Round neck',
        articleNumber: 'TR-001',
        colorText: 'Cream, Charcoal',
        colorHex: '#f5e9d0, #36454f',
        quantity: 75,
        unitPriceForeign: '28',
      }),
    ).not.toThrow()
  })
})
