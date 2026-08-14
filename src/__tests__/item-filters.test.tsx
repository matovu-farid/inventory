// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemFilters } from '#/components/items/item-filters'
import type { ItemFilterValues } from '#/components/items/item-filters'

afterEach(cleanup)

const emptyFilters: ItemFilterValues = {
  query: '',
  includeArchived: false,
  returnDateFrom: '',
  returnDateTo: '',
}

describe('ItemFilters', () => {
  it('emits the complete filter state when a return date changes', () => {
    const onFiltersChange = vi.fn()
    const filters = { ...emptyFilters, query: 'coat' }

    render(
      <ItemFilters
        filters={filters}
        canManage
        onFiltersChange={onFiltersChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Return date from'), {
      target: { value: '2026-01-15' },
    })

    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      returnDateFrom: '2026-01-15',
    })
  })

  it('shows an error for a reversed range', () => {
    render(
      <ItemFilters
        filters={{
          ...emptyFilters,
          returnDateFrom: '2026-02-01',
          returnDateTo: '2026-01-31',
        }}
        canManage
        onFiltersChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'Return date from must be on or before return date to',
    )
  })

  it('hides the archive toggle when the user cannot manage items', () => {
    render(
      <ItemFilters
        filters={emptyFilters}
        canManage={false}
        onFiltersChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: /archived/i })).toBeNull()
  })
})
