import { describe, it, expect } from 'vitest'
import { stockTakeLines } from '#/db/schema'

describe('stock_take_lines schema — variant-flexibility denorms', () => {
  it('has item_id NOT NULL', () => {
    const col = stockTakeLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })
  it('variant_id nullable', () => {
    const col = stockTakeLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
