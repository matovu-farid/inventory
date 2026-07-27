import { describe, it, expect } from 'vitest'
import { storeStock } from '#/db/schema/store'

describe('store_stock schema — variant-flexibility', () => {
  it('has item_id as NOT NULL uuid', () => {
    const col = storeStock.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it('variant_id is nullable', () => {
    const col = storeStock.variantId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('no longer has minimumSellPriceUgx column', () => {
    expect(
      (storeStock as unknown as Record<string, unknown>).minimumSellPriceUgx,
    ).toBeUndefined()
  })
})
