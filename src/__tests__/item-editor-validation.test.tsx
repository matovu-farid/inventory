// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '#/components/ui/tooltip'
import { ItemEditor } from '#/components/items/item-editor'

const {
  createItem,
  createSupplier,
  listItems,
  listSuppliersForSelect,
  updateItem,
} = vi.hoisted(() => ({
  createItem: vi.fn(),
  createSupplier: vi.fn(),
  listItems: vi.fn().mockResolvedValue([]),
  listSuppliersForSelect: vi.fn().mockResolvedValue([]),
  updateItem: vi.fn(),
}))

vi.mock('#/server/functions/items/items', () => ({
  createItem,
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
    onChange,
    onCreateNew,
    triggerClassName,
  }: {
    value?: string
    onChange?: (value: string) => void
    onCreateNew?: (value: string) => void
    triggerClassName?: string
  }) => (
    <div>
      <span data-testid="selected-supplier">{value}</span>
      <button
        type="button"
        role="combobox"
        className={triggerClassName}
        onClick={() => onChange?.('supplier-id')}
      >
        Select supplier
      </button>
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
  articleNumbers: [{ id: 'article-id', articleNumber: 'TEE-001' }],
  name: 'Crew-neck T-shirt',
  design: 'Tops',
  supplier: { id: 'supplier-id', name: 'Supplier' },
  costPrice: '10000',
  costCurrency: 'UGX' as const,
  minimumSellPriceUgx: '100',
}

afterEach(cleanup)

beforeEach(() => {
  createItem.mockReset()
  createSupplier.mockReset()
  listItems.mockReset().mockResolvedValue([])
  listSuppliersForSelect.mockReset().mockResolvedValue([])
  updateItem.mockReset()
})

describe('ItemEditor validation errors', () => {
  it('opens supplier creation from an unmatched search and selects the result', () => {
    render(
      <TooltipProvider>
        <ItemEditor allowCreateSupplier />
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
        <ItemEditor />
      </TooltipProvider>,
    )

    expect(
      screen.queryByRole('button', { name: 'Create supplier from search' }),
    ).toBeNull()
  })

  it('contains background supplier-loading failures inside the editor', async () => {
    listSuppliersForSelect.mockRejectedValueOnce(
      new Error('Could not load suppliers'),
    )

    render(
      <TooltipProvider>
        <ItemEditor item={item} />
      </TooltipProvider>,
    )

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not load suppliers',
    )
  })

  it('uses custom chevrons for the collapsible item sections', () => {
    const { container } = render(
      <TooltipProvider>
        <ItemEditor item={item} />
      </TooltipProvider>,
    )

    const summaries = [...container.querySelectorAll('summary')]

    expect(summaries).toHaveLength(2)
    expect(
      summaries.every((summary) => summary.className.includes('list-none')),
    ).toBe(true)
    expect(container.querySelectorAll('summary svg')).toHaveLength(2)
  })

  it('uses two rows: supplier then item name, followed by design', () => {
    render(
      <TooltipProvider>
        <ItemEditor item={item} />
      </TooltipProvider>,
    )

    const itemName = screen.getByPlaceholderText('T-shirt')
    const design = screen.getByPlaceholderText('Round neck')
    const supplier = screen.getByText('Current supplier')

    expect(supplier.compareDocumentPosition(itemName)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(itemName.compareDocumentPosition(design)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(itemName.getAttribute('placeholder')).toBe('T-shirt')
    expect(design.getAttribute('placeholder')).toBe('Round neck')
  })

  it('aligns the supplier, item, design, and article-number controls', () => {
    render(
      <TooltipProvider>
        <ItemEditor />
      </TooltipProvider>,
    )

    const controls = [
      screen.getAllByRole('combobox')[0],
      screen.getByPlaceholderText('T-shirt'),
      screen.getByPlaceholderText('Round neck'),
      screen.getByPlaceholderText('Enter an article number'),
      screen.getByRole('button', { name: 'Add' }),
    ]

    expect(
      controls.every((control) => control.className.includes('h-11')),
    ).toBe(true)
  })

  it('uses the same normal-size pill treatment for article numbers and sizes', () => {
    render(
      <TooltipProvider>
        <ItemEditor
          item={{
            ...item,
            colors: [{ colorName: 'Black', colorHex: '#000000' }],
            variants: [{ size: 'M' }],
          }}
        />
      </TooltipProvider>,
    )

    const articlePill = screen
      .getByText('TEE-001')
      .closest('[data-slot="badge"]')
    const sizePill = screen.getByText('M').closest('[data-slot="badge"]')

    expect(articlePill?.className).toContain('text-sm')
    expect(articlePill?.className).toContain('py-1')
    expect(sizePill?.className).toContain('text-sm')
    expect(sizePill?.className).toContain('py-1')
  })

  it('shows sizes only after a color has been added', () => {
    render(
      <TooltipProvider>
        <ItemEditor />
      </TooltipProvider>,
    )

    expect(screen.queryByText('Sizes (optional)')).toBeNull()

    fireEvent.change(
      screen.getByPlaceholderText('Color name (e.g. Burgundy)'),
      {
        target: { value: 'Black' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add color' }))

    const colors = screen.getByText('Initial colors (optional)')
    const sizes = screen.getByText('Sizes (optional)')
    expect(colors.compareDocumentPosition(sizes)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('places minimum sell price and low-stock threshold on one responsive row', () => {
    render(
      <TooltipProvider>
        <ItemEditor />
      </TooltipProvider>,
    )

    const minimumSellPrice = screen.getByText('Minimum sell price (UGX)')
    const lowStockThreshold = screen.getByText('Low-stock threshold')

    expect(minimumSellPrice.closest('div.grid')).toBe(
      lowStockThreshold.closest('div.grid'),
    )
  })

  it('renders supplied content immediately before the submit button', () => {
    const { container } = render(
      <TooltipProvider>
        <ItemEditor
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

  it('runs the pre-submit guard before saving anything', async () => {
    const beforeSubmit = vi.fn().mockResolvedValue(false)

    render(
      <TooltipProvider>
        <ItemEditor item={item} beforeSubmit={beforeSubmit} />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await vi.waitFor(() => expect(beforeSubmit).toHaveBeenCalledTimes(1))
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('retries an awaited creation callback without creating duplicate item data', async () => {
    createItem.mockResolvedValue({ id: 'created-item' })
    const onCreated = vi
      .fn()
      .mockRejectedValueOnce(new Error('Route write failed'))
      .mockResolvedValue(undefined)

    render(
      <TooltipProvider>
        <ItemEditor onCreated={onCreated} />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getAllByRole('combobox')[0])
    fireEvent.change(screen.getByPlaceholderText('Enter an article number'), {
      target: { value: 'TEE-001' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(screen.getByPlaceholderText('T-shirt'), {
      target: { value: 'T-shirt' },
    })
    fireEvent.change(screen.getByPlaceholderText('Round neck'), {
      target: { value: 'Round neck' },
    })
    const costInput = screen
      .getByText('Current supplier cost')
      .parentElement?.querySelector('input')
    const minimumSellPriceInput = screen
      .getByText('Minimum sell price (UGX)')
      .parentElement?.querySelector('input')
    if (!costInput || !minimumSellPriceInput) throw new Error('Inputs missing')
    fireEvent.change(costInput, { target: { value: '100' } })
    fireEvent.change(minimumSellPriceInput, { target: { value: '1000' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create item' }))
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Route write failed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create item' }))
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(2))
    expect(createItem).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenLastCalledWith('created-item', 'TEE-001')
  })

  it('shows a field error and does not submit a zero minimum sell price', async () => {
    render(
      <TooltipProvider>
        <ItemEditor item={{ ...item, minimumSellPriceUgx: '0' }} />
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
        <ItemEditor item={item} />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Minimum sell price must be positive'),
    ).toBeTruthy()
    expect(screen.queryByText(/"minimumSellPriceUgx"/)).toBeNull()
  })
})
