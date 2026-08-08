import { describe, expect, it } from 'vitest'

import { resolveDefaultPurchaseSupplierId } from '#/lib/supply-item-supplier-default'

describe('resolveDefaultPurchaseSupplierId', () => {
  it('keeps the saved supplier when editing an existing entry', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'item-supplier',
        routeSupplierIds: ['route-supplier'],
        existingEntrySupplierId: 'saved-supplier',
      }),
    ).toBe('saved-supplier')
  })

  it('uses the item supplier when it is attached to the route', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'item-supplier',
        routeSupplierIds: ['route-supplier', 'item-supplier'],
      }),
    ).toBe('item-supplier')
  })

  it('uses the first route supplier when the item supplier is not on the route', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'catalog-supplier',
        routeSupplierIds: ['route-supplier'],
      }),
    ).toBe('route-supplier')
  })

  it('falls back to the item supplier when there are no route suppliers', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'catalog-supplier',
        routeSupplierIds: [],
      }),
    ).toBe('catalog-supplier')
  })
})
