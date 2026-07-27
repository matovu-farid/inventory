import { describe, it, expect } from 'vitest'
import { shopStock } from '#/db/schema/shops'

describe('shop_stock schema — variant-flexibility', () => {
  it('has item_id as NOT NULL uuid', () => {
    const col = shopStock.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it('variant_id is nullable', () => {
    const col = shopStock.variantId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('has supply_route_line_id (nullable) for cost provenance', () => {
    const col = shopStock.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('carries the lot minimumSellPriceUgx', () => {
    expect(shopStock.minimumSellPriceUgx).toBeDefined()
  })
})
