import { describe, it, expect } from 'vitest'
import { storeTransferLines } from '#/db/schema/transfers'

describe('store_transfer_lines schema — variant-flexibility', () => {
  it('has item_id NOT NULL', () => {
    const col = storeTransferLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it('variant_id is nullable', () => {
    const col = storeTransferLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('store_stock_id is now nullable', () => {
    const col = storeTransferLines.storeStockId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('keeps transfer price at line level while allocations carry lot floors', () => {
    expect(storeTransferLines.unitPriceUgx).toBeDefined()
  })
})
