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
  it('uses custom chevrons for the collapsible item sections', () => {
    const { container } = render(
      <TooltipProvider>
        <ItemEditor categories={['Tops']} item={item} />
      </TooltipProvider>,
    )

    const summaries = [...container.querySelectorAll('summary')]

    expect(summaries).toHaveLength(2)
    expect(
      summaries.every((summary) => summary.className.includes('list-none')),
    ).toBe(true)
    expect(container.querySelectorAll('summary svg')).toHaveLength(2)
  })

  it('groups the supplier and category fields into a responsive row', () => {
    render(
      <TooltipProvider>
        <ItemEditor categories={['Tops']} item={item} />
      </TooltipProvider>,
    )

    const supplierField = screen.getByText('Current supplier').closest('div')
    const categoryField = screen.getByText('Category').closest('div')
    const itemNameField = screen.getByText('Item name').closest('div')
    const articleNumberField = screen.getByText('Article number').closest('div')
    const supplierCategoryRow = supplierField?.parentElement
    const itemArticleRow = itemNameField?.parentElement

    expect(supplierCategoryRow?.className).toContain('md:grid-cols-2')
    expect(supplierCategoryRow).toContain(categoryField)
    expect(itemArticleRow?.className).toContain('md:grid-cols-2')
    expect(itemArticleRow).toContain(articleNumberField)
  })

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
