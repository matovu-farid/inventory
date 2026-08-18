// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemsPageContent } from '#/components/items/items-page-content'
import type { ItemListRow } from '#/components/items/items-page-content'

vi.mock('#/components/items/item-card', () => ({
  ItemCard: ({
    data,
  }: {
    data: { articleNumbers: Array<{ articleNumber: string }>; name: string }
  }) => (
    <div>
      {data.articleNumbers.map((number) => number.articleNumber).join(', ')}{' '}
      {data.name}
    </div>
  ),
}))

afterEach(cleanup)

const row: ItemListRow = {
  id: 'item-1',
  articleNumbers: [{ id: 'article-1', articleNumber: 'TEE-001' }],
  name: 'Crew-neck T-shirt',
  design: 'Round neck',
  deletedAt: null,
  variants: [],
  colors: [],
}

describe('ItemsPageContent', () => {
  it('sends complete filters and preserves the remaining bound when clearing', async () => {
    const loadItems = vi.fn().mockResolvedValue([row])
    render(<ItemsPageContent initial={[row]} canManage loadItems={loadItems} />)

    fireEvent.change(screen.getByLabelText('Return date to'), {
      target: { value: '2026-01-31' },
    })
    await waitFor(() => expect(loadItems).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Return date from'), {
      target: { value: '2026-01-15' },
    })
    await waitFor(() => expect(loadItems).toHaveBeenCalledTimes(2))
    expect(loadItems).toHaveBeenLastCalledWith({
      query: '',
      includeArchived: false,
      returnDateFrom: '2026-01-15',
      returnDateTo: '2026-01-31',
    })

    fireEvent.change(screen.getByLabelText('Return date from'), {
      target: { value: '' },
    })
    await waitFor(() => expect(loadItems).toHaveBeenCalledTimes(3))
    expect(loadItems).toHaveBeenLastCalledWith({
      query: '',
      includeArchived: false,
      returnDateFrom: '',
      returnDateTo: '2026-01-31',
    })
  })

  it('does not load results for a reversed range and keeps current results', async () => {
    const loadItems = vi.fn().mockResolvedValue([row])
    render(<ItemsPageContent initial={[row]} canManage loadItems={loadItems} />)

    fireEvent.change(screen.getByLabelText('Return date from'), {
      target: { value: '2026-02-01' },
    })
    await waitFor(() => expect(loadItems).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('Return date to'), {
      target: { value: '2026-01-31' },
    })

    expect(loadItems).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain(
      'Return date from must be on or before return date to',
    )
    expect(screen.getByText('1 item')).toBeTruthy()
    expect(screen.getByText('TEE-001 Crew-neck T-shirt')).toBeTruthy()
  })

  it('shows a filtered empty state and hides archive controls for non-managers', async () => {
    const loadItems = vi.fn().mockResolvedValue([])
    render(
      <ItemsPageContent
        initial={[row]}
        canManage={false}
        loadItems={loadItems}
      />,
    )

    expect(screen.queryByRole('button', { name: /archived/i })).toBeNull()
    fireEvent.change(screen.getByLabelText('Return date from'), {
      target: { value: '2026-01-15' },
    })

    await waitFor(() =>
      expect(screen.getByText('No matching items.')).toBeTruthy(),
    )
    expect(screen.getByText('0 items')).toBeTruthy()
  })
})
