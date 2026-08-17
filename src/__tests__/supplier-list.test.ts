import { describe, expect, it } from 'vitest'
import { getVisibleSuppliers } from '#/lib/supplier-list'

const active = [{ id: 'active', name: 'Active' }]
const refreshedActive = [{ id: 'new', name: 'New supplier' }]
const archivedView = [
  { id: 'active', name: 'Active' },
  { id: 'archived', name: 'Archived', deletedAt: new Date() },
]

describe('getVisibleSuppliers', () => {
  it('shows a newly created supplier from refreshed active loader data', () => {
    expect(getVisibleSuppliers(refreshedActive, null, false)).toEqual([
      { id: 'new', name: 'New supplier' },
    ])
  })

  it('removes an archived supplier from refreshed active loader data', () => {
    expect(getVisibleSuppliers(active, null, false)).toEqual([
      { id: 'active', name: 'Active' },
    ])
  })

  it('uses the archived-inclusive list only when archived search is on', () => {
    expect(getVisibleSuppliers(active, archivedView, true)).toEqual(
      archivedView,
    )
  })
})
