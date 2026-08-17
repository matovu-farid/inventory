import { describe, expect, it } from 'vitest'
import { getDistinctRouteSuppliers } from '#/lib/supply-route-suppliers'

describe('getDistinctRouteSuppliers', () => {
  it('deduplicates suppliers in first-seen line order', () => {
    expect(
      getDistinctRouteSuppliers([
        { supplier: { id: 's1', name: 'Alpha' } },
        { supplier: { id: 's1', name: 'Alpha' } },
        { supplier: { id: 's2', name: 'Beta' } },
      ]),
    ).toEqual([
      { id: 's1', name: 'Alpha' },
      { id: 's2', name: 'Beta' },
    ])
  })

  it('returns no suppliers for an empty route', () => {
    expect(getDistinctRouteSuppliers([])).toEqual([])
  })
})
