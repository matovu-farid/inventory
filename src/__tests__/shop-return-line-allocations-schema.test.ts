import { describe, it, expect } from 'vitest'
import { shopReturnLineAllocations } from '#/db/schema'

describe('shop_return_line_allocations schema', () => {
  it('exists with the expected NOT NULL keys', () => {
    expect(shopReturnLineAllocations).toBeDefined()
    const srl = shopReturnLineAllocations.shopReturnLineId
    const ss = shopReturnLineAllocations.shopStockId
    expect((srl as { notNull?: boolean }).notNull).toBe(true)
    expect((ss as { notNull?: boolean }).notNull).toBe(true)
  })

  it('has supplyRouteLineId nullable for provenance carry', () => {
    const col = shopReturnLineAllocations.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it('carries a per-allocation cost snapshot', () => {
    const col = shopReturnLineAllocations.costPerUnitUgx
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })
})
