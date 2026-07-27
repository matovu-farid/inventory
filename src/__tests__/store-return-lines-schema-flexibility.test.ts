import { describe, it, expect } from 'vitest'
import { storeReturnLines } from '#/db/schema'

describe('store_return_lines schema — variant-flexibility', () => {
  it('has item_id as NOT NULL uuid', () => {
    const col = storeReturnLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it('variant_id is nullable', () => {
    const col = storeReturnLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('shop_stock_id is nullable', () => {
    const col = storeReturnLines.shopStockId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
