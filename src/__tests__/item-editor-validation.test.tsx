// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '#/components/ui/tooltip'
import { ItemEditor } from '#/components/items/item-editor'

const { updateItem } = vi.hoisted(() => ({ updateItem: vi.fn() }))

vi.mock('#/server/functions/items/items', () => ({
  createItem: vi.fn(),
  listItems: vi.fn().mockResolvedValue([]),
  updateItem,
}))

vi.mock('#/server/functions/supply/routes', () => ({
  listSuppliersForSelect: vi.fn().mockResolvedValue([]),
}))

const item = {
  id: 'item-id',
  articleNumber: 'TEE-001',
  name: 'Crew-neck T-shirt',
  category: 'Tops',
  supplier: { id: 'supplier-id', name: 'Supplier' },
  costPrice: '10000',
  costCurrency: 'UGX' as const,
  minimumSellPriceUgx: '100',
}

afterEach(cleanup)

beforeEach(() => {
  updateItem.mockReset()
})

describe('ItemEditor validation errors', () => {
  it('shows a field error and does not submit a zero minimum sell price', async () => {
    render(
      <TooltipProvider>
        <ItemEditor
          categories={['Tops']}
          item={{ ...item, minimumSellPriceUgx: '0' }}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Minimum sell price must be positive'),
    ).toBeTruthy()
    expect(updateItem).not.toHaveBeenCalled()
    expect(screen.queryByText(/"minimumSellPriceUgx"/)).toBeNull()
  })

  it('turns a server validation issue into the same field error', async () => {
    updateItem.mockRejectedValueOnce(
      new Error(
        '[{"code":"custom","path":["minimumSellPriceUgx"],"message":"Minimum sell price must be positive"}]',
      ),
    )

    render(
      <TooltipProvider>
        <ItemEditor categories={['Tops']} item={item} />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Minimum sell price must be positive'),
    ).toBeTruthy()
    expect(screen.queryByText(/"minimumSellPriceUgx"/)).toBeNull()
  })
})
