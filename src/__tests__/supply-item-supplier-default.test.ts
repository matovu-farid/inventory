import { describe, expect, it } from 'vitest'

import { resolveDefaultPurchaseSupplierId } from '#/lib/supply-item-supplier-default'

describe('resolveDefaultPurchaseSupplierId', () => {
  it('keeps the saved supplier when editing an existing entry', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'item-supplier',
        supplierIds: ['route-supplier'],
        existingEntrySupplierId: 'saved-supplier',
      }),
    ).toBe('saved-supplier')
  })

  it('uses the item supplier as the default source of truth', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'item-supplier',
        supplierIds: ['route-supplier'],
      }),
    ).toBe('item-supplier')
  })

  it('falls back to the first supplier when the item has none', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: null,
        supplierIds: ['route-supplier'],
      }),
    ).toBe('route-supplier')
  })

  it('falls back to the item supplier when there are no route suppliers', () => {
    expect(
      resolveDefaultPurchaseSupplierId({
        itemSupplierId: 'catalog-supplier',
        supplierIds: [],
      }),
    ).toBe('catalog-supplier')
  })
})
