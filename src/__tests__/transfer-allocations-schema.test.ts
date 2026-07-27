import { describe, it, expect } from 'vitest'
import { storeTransferAllocations } from '#/db/schema'

describe('store_transfer_allocations schema', () => {
  it('exists with the expected NOT NULL keys', () => {
    expect(storeTransferAllocations).toBeDefined()
    const stl = storeTransferAllocations.storeTransferLineId
    const ss = storeTransferAllocations.storeStockId
    expect((stl as { notNull?: boolean }).notNull).toBe(true)
    expect((ss as { notNull?: boolean }).notNull).toBe(true)
  })

  it('has supplyRouteLineId nullable for provenance carry', () => {
    const col = storeTransferAllocations.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
