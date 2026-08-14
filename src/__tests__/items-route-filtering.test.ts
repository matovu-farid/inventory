import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadItemResults } from '#/routes/items/index'
import { listItems, searchItems } from '#/server/functions/items/items'

vi.mock('#/server/functions/items/items', () => ({
  listItems: vi.fn(),
  searchItems: vi.fn(),
}))

const mockedListItems = vi.mocked(listItems)
const mockedSearchItems = vi.mocked(searchItems)

const baseFilters = {
  query: '',
  includeArchived: false,
  returnDateFrom: '',
  returnDateTo: '',
}

beforeEach(() => {
  mockedListItems.mockReset()
  mockedSearchItems.mockReset()
  mockedListItems.mockResolvedValue([])
  mockedSearchItems.mockResolvedValue([])
})

describe('loadItemResults', () => {
  it('uses the unbounded list endpoint for date-only filters', async () => {
    await loadItemResults({
      ...baseFilters,
      returnDateFrom: '2026-01-15',
      returnDateTo: '2026-01-31',
    })

    expect(mockedListItems).toHaveBeenCalledWith({
      data: {
        includeArchived: false,
        returnDateFrom: '2026-01-15',
        returnDateTo: '2026-01-31',
      },
    })
    expect(mockedSearchItems).not.toHaveBeenCalled()
  })

  it('uses text search while preserving text, archive, and date filters', async () => {
    await loadItemResults({
      query: 'coat',
      includeArchived: true,
      returnDateFrom: '2026-01-01',
      returnDateTo: '',
    })

    expect(mockedSearchItems).toHaveBeenCalledWith({
      data: {
        query: 'coat',
        includeArchived: true,
        returnDateFrom: '2026-01-01',
        returnDateTo: undefined,
      },
    })
    expect(mockedListItems).not.toHaveBeenCalled()
  })

  it('preserves the existing blank unfiltered search path', async () => {
    await loadItemResults(baseFilters)

    expect(mockedSearchItems).toHaveBeenCalledWith({
      data: {
        query: '',
        includeArchived: false,
        returnDateFrom: undefined,
        returnDateTo: undefined,
      },
    })
    expect(mockedListItems).not.toHaveBeenCalled()
  })
})
