import { describe, it, expect } from 'vitest'
import { shopReturnLines } from '#/db/schema'

describe('shop_return_lines schema — variant-flexibility', () => {
  it('has item_id as NOT NULL uuid', () => {
    const col = shopReturnLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it('variant_id is nullable', () => {
    const col = shopReturnLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('shop_stock_id is nullable', () => {
    const col = shopReturnLines.shopStockId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
