// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupplyRouteItemPicker } from '#/components/supply/supply-route-item-picker'

vi.mock('#/server/functions/items/items', () => ({
  searchItems: vi.fn().mockResolvedValue([]),
  restoreItem: vi.fn(),
}))

vi.mock('#/components/ui/combobox', () => ({
  Combobox: ({
    emptyMessage,
    onCreateNew,
  }: {
    emptyMessage: React.ReactNode
    onCreateNew?: () => void
  }) => (
    <div>
      <div data-testid="empty-message">{emptyMessage}</div>
      <span data-testid="has-create-handler">{String(!!onCreateNew)}</span>
    </div>
  ),
}))

afterEach(cleanup)

describe('SupplyRouteItemPicker', () => {
  it('does not offer item creation when the inline item form is already open', () => {
    render(<SupplyRouteItemPicker onChange={vi.fn()} />)

    expect(screen.getByTestId('empty-message').textContent).toBe(
      'No matching item.',
    )
    expect(screen.getByTestId('has-create-handler').textContent).toBe('false')
  })
})
