// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemPicker } from '#/components/items/item-picker'

const { searchItems, restoreItem } = vi.hoisted(() => ({
  searchItems: vi.fn(),
  restoreItem: vi.fn(),
}))

vi.mock('#/server/functions/items/items', () => ({
  searchItems,
  restoreItem,
}))

vi.mock('#/components/ui/combobox', () => ({
  Combobox: ({ options }: { options: ReadonlyArray<unknown> }) => (
    <div data-testid="picker-options">{options.length}</div>
  ),
}))

afterEach(cleanup)

beforeEach(() => {
  searchItems.mockReset()
  restoreItem.mockReset()
})

describe('ItemPicker', () => {
  it('contains item search failures inside the picker', async () => {
    searchItems.mockRejectedValueOnce(new Error('Could not load items'))

    render(<ItemPicker onChange={vi.fn()} />)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load items',
    )
  })

  it('treats a null search payload as an empty result set', async () => {
    searchItems.mockResolvedValueOnce(null)

    render(<ItemPicker onChange={vi.fn()} />)

    expect((await screen.findByTestId('picker-options')).textContent).toBe('0')
  })
})
