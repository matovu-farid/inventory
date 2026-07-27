import { describe, it, expect } from 'vitest'
import { items } from '#/db/schema/items'

describe('items schema — variant-flexibility fields', () => {
  it('has minimum_sell_price_ugx as NOT NULL numeric', () => {
    const col = items.minimumSellPriceUgx
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it('has low_stock_threshold as nullable integer', () => {
    const col = items.lowStockThreshold
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
