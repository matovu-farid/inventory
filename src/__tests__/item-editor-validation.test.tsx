// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '#/components/ui/tooltip'
import { ItemEditor } from '#/components/items/item-editor'

const { createSupplier, listItems, listSuppliersForSelect, updateItem } =
  vi.hoisted(() => ({
    createSupplier: vi.fn(),
    listItems: vi.fn().mockResolvedValue([]),
    listSuppliersForSelect: vi.fn().mockResolvedValue([]),
    updateItem: vi.fn(),
  }))

vi.mock('#/server/functions/items/items', () => ({
  createItem: vi.fn(),
  listItems,
  updateItem,
}))

vi.mock('#/server/functions/supply/routes', () => ({
  listSuppliersForSelect,
}))

vi.mock('#/server/functions/supply/suppliers', () => ({
  createSupplier,
}))

vi.mock('#/components/ui/combobox', () => ({
  Combobox: ({
    value,
    onCreateNew,
  }: {
    value?: string
    onCreateNew?: (value: string) => void
  }) => (
    <div>
      <span data-testid="selected-supplier">{value}</span>
      {onCreateNew && (
        <button type="button" onClick={() => onCreateNew(' danny ')}>
          Create supplier from search
        </button>
      )}
    </div>
  ),
}))

vi.mock('#/components/supply/create-supplier-dialog', () => ({
  CreateSupplierDialog: ({
    open,
    initialName,
    onOpenChange,
    onCreated,
  }: {
    open: boolean
    initialName: string
    onOpenChange: (open: boolean) => void
    onCreated: (supplier: { id: string; name: string }) => void
  }) =>
    open ? (
      <div role="dialog">
        <p>{initialName}</p>
        <button
          type="button"
          onClick={() => onCreated({ id: 'supplier-new', name: 'Danny' })}
        >
          Create supplier
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
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
  createSupplier.mockReset()
  listItems.mockReset().mockResolvedValue([])
  listSuppliersForSelect.mockReset().mockResolvedValue([])
  updateItem.mockReset()
})

describe('ItemEditor validation errors', () => {
  it('opens supplier creation from an unmatched search and selects the result', () => {
    render(
      <TooltipProvider>
        <ItemEditor categories={['Tops']} allowCreateSupplier />
      </TooltipProvider>,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Create supplier from search' }),
    )

    expect(screen.getByRole('dialog').textContent).toContain('danny')
    fireEvent.click(screen.getByRole('button', { name: 'Create supplier' }))

    expect(screen.getByTestId('selected-supplier').textContent).toContain(
      'supplier-new',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not expose supplier creation unless explicitly enabled', () => {
    render(
      <TooltipProvider>
        <ItemEditor categories={['Tops']} />
      </TooltipProvider>,
    )

    expect(
      screen.queryByRole('button', { name: 'Create supplier from search' }),
    ).toBeNull()
  })

  it('contains background catalog-loading failures inside the editor', async () => {
    listItems.mockRejectedValueOnce(new Error('Could not load catalog'))

    render(
      <TooltipProvider>
        <ItemEditor categories={['Tops']} item={item} />
      </TooltipProvider>,
    )

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load catalog',
    )
  })

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

  it('renders supplied content immediately before the submit button', () => {
    const { container } = render(
      <TooltipProvider>
        <ItemEditor
          categories={['Tops']}
          item={item}
          beforeSubmitContent={
            <div data-testid="before-submit">Route exchange rates</div>
          }
        />
      </TooltipProvider>,
    )

    const insertedContent = screen.getByTestId('before-submit')
    const submitButton = screen.getByRole('button', { name: 'Save changes' })

    expect(
      container.compareDocumentPosition(submitButton) &
        Node.DOCUMENT_POSITION_CONTAINED_BY,
    ).toBeTruthy()
    expect(
      insertedContent.compareDocumentPosition(submitButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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
