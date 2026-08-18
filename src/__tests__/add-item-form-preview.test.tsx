// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemSummary } from '#/components/items/item-picker'
import { AddItemForm } from '#/components/supply/add-item-form'

const {
  addSupplyRouteVariants,
  replaceSupplyRouteEntry,
  getItemByArticle,
  resolveDefaultPurchaseSupplierId,
} = vi.hoisted(() => ({
  addSupplyRouteVariants: vi.fn().mockResolvedValue([]),
  replaceSupplyRouteEntry: vi.fn().mockResolvedValue([]),
  getItemByArticle: vi.fn(),
  resolveDefaultPurchaseSupplierId: vi.fn().mockReturnValue('supplier-1'),
}))

const item: ItemSummary = {
  id: 'item-1',
  articleNumbers: [{ id: 'article-1', articleNumber: 'TEE-001' }],
  name: 'Crew-neck T-shirt',
  design: 'Tops',
  costPrice: '100',
  costCurrency: 'RMB',
  minimumSellPriceUgx: '12000',
  supplier: { id: 'supplier-1', name: 'Supplier One' },
  colors: [
    {
      id: 'color-1',
      colorName: 'Black',
      colorHex: '#000000',
      imageS3Key: null,
    },
  ],
  variants: [{ id: 'variant-1', colorId: 'color-1', size: 'M' }],
}

const itemWithoutSizes: ItemSummary = {
  ...item,
  variants: [],
}

const itemWithoutColors: ItemSummary = {
  ...item,
  colors: [],
  variants: [],
}

vi.mock('#/server/functions/supply/items', () => ({
  addSupplyRouteVariants,
  replaceSupplyRouteEntry,
}))

vi.mock('#/server/functions/items/items', () => ({
  getItemByArticle,
  searchItems: vi.fn().mockResolvedValue([]),
  restoreItem: vi.fn(),
  updateItem: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('#/server/functions/items/colors', () => ({
  deleteItemColor: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('#/lib/supply-item-supplier-default', () => ({
  resolveDefaultPurchaseSupplierId,
}))

vi.mock('#/components/items/item-picker', () => ({
  ItemPicker: ({
    onChange,
    onCreateNew,
  }: {
    onChange: (id: string, selected: ItemSummary) => void
    onCreateNew?: () => void
  }) => (
    <div>
      <button type="button" onClick={() => onChange(item.id, item)}>
        Select item
      </button>
      <button type="button" onClick={onCreateNew}>
        Create from picker
      </button>
    </div>
  ),
}))

vi.mock('#/components/supply/supply-route-item-picker', () => ({
  SupplyRouteItemPicker: ({
    onChange,
  }: {
    onChange: (id: string, selected: ItemSummary) => void
  }) => (
    <div>
      <button type="button" onClick={() => onChange(item.id, item)}>
        Select item
      </button>
      <button
        type="button"
        onClick={() => onChange(itemWithoutSizes.id, itemWithoutSizes)}
      >
        Select item without sizes
      </button>
      <button
        type="button"
        onClick={() => onChange(itemWithoutColors.id, itemWithoutColors)}
      >
        Select item without colors
      </button>
    </div>
  ),
}))

vi.mock('#/components/items/item-editor', () => ({
  ItemEditor: ({
    beforeSubmitContent,
    beforeSubmit,
    onDraftChange,
    onCreated,
  }: {
    beforeSubmitContent?: React.ReactNode
    beforeSubmit?: () => boolean | void | Promise<boolean | void>
    onDraftChange?: (draft: {
      supplierId: string
      costCurrency: 'RMB' | 'USD' | 'UGX'
      colors: []
      sizes: []
    }) => void
    onCreated?: (itemId: string, articleNumber: string) => void | Promise<void>
  }) => (
    <MockItemEditor
      beforeSubmitContent={beforeSubmitContent}
      beforeSubmit={beforeSubmit}
      onDraftChange={onDraftChange}
      onCreated={onCreated}
    />
  ),
}))

function MockItemEditor({
  beforeSubmitContent,
  beforeSubmit,
  onDraftChange,
  onCreated,
}: {
  beforeSubmitContent?: React.ReactNode
  beforeSubmit?: () => boolean | void | Promise<boolean | void>
  onDraftChange?: (draft: {
    supplierId: string
    costCurrency: 'RMB' | 'USD' | 'UGX'
    colors: []
    sizes: []
  }) => void
  onCreated?: (itemId: string, articleNumber: string) => void | Promise<void>
}) {
  useEffect(() => {
    onDraftChange?.({
      supplierId: 'supplier-1',
      costCurrency: 'RMB',
      colors: [],
      sizes: [],
    })
  }, [onDraftChange])

  return (
    <>
      {beforeSubmitContent}
      <button
        type="button"
        onClick={() => {
          void (async () => {
            if ((await beforeSubmit?.()) === false) return
            await onCreated?.(
              item.id,
              item.articleNumbers[0]?.articleNumber ?? '',
            )
          })()
        }}
      >
        Done
      </button>
    </>
  )
}

vi.mock('#/components/items/color-editor', () => ({
  ColorEditor: () => <div>Mock color editor</div>,
}))

vi.mock('#/components/items/variant-grid', () => ({
  VariantGrid: ({
    onChange,
  }: {
    onChange: (values: Record<string, number>) => void
  }) => (
    <button type="button" onClick={() => onChange({ 'color-1|M': 2 })}>
      Set quantity
    </button>
  ),
}))

vi.mock('#/components/supply/split-item-form', () => ({
  ColorQuantityList: () => <div>Mock color quantities</div>,
}))

vi.mock('#/components/ui/responsive-dialog', () => ({
  ResponsiveDialog: ({
    open,
    children,
  }: {
    open?: boolean
    children: React.ReactNode
  }) => (open ? <div role="dialog">{children}</div> : null),
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

function renderNewForm() {
  const onSaved = vi.fn()
  const onDone = vi.fn()
  render(
    <AddItemForm
      supplyRouteId="route-1"
      rateUgxPerUsd="3750"
      rateRmbPerUsd="7.25"
      suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
      onSaved={onSaved}
      onDone={onDone}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Select item' }))
  fireEvent.click(screen.getByRole('button', { name: 'Per color × size' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set quantity' }))
  return { onSaved, onDone }
}

function submitDraft() {
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
}

afterEach(cleanup)

beforeEach(() => {
  addSupplyRouteVariants.mockClear()
  replaceSupplyRouteEntry.mockClear()
  getItemByArticle.mockReset()
  resolveDefaultPurchaseSupplierId.mockReturnValue('supplier-1')
})

describe('AddItemForm preview flow', () => {
  it('shows route detail controls inside the new-item form before Done', async () => {
    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Total only' })).toBeTruthy()
    expect(screen.getByText('Total quantity *')).toBeTruthy()
    expect(screen.getByPlaceholderText('0')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() =>
      expect(screen.getByText('Enter at least one quantity')).toBeTruthy(),
    )
    expect(screen.queryByRole('heading', { name: 'Review item' })).toBeNull()
    expect(screen.queryByText('Select a purchase supplier')).toBeNull()
    expect(addSupplyRouteVariants).not.toHaveBeenCalled()
  })

  it('saves a new item and route entry from one inline Done submission', async () => {
    getItemByArticle.mockResolvedValue(item)
    const onDone = vi.fn()

    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={onDone}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('0'), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(addSupplyRouteVariants).toHaveBeenCalledTimes(1))
    expect(addSupplyRouteVariants).toHaveBeenCalledWith({
      data: expect.objectContaining({
        supplyRouteId: 'route-1',
        itemId: 'item-1',
        supplierId: 'supplier-1',
        cells: [{ quantity: 5 }],
      }),
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('heading', { name: 'Review item' })).toBeNull()
  })

  it('reveals detail levels progressively from the selected item attributes', () => {
    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select item' }))

    expect(screen.getByRole('button', { name: 'Total only' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Per color' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Per color × size' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Total only' }).className,
    ).toContain('bg-primary')

    fireEvent.click(
      screen.getByRole('button', { name: 'Select item without sizes' }),
    )
    expect(screen.getByRole('button', { name: 'Total only' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Per color' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Per color × size' }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Select item without colors' }),
    )
    expect(screen.getByRole('button', { name: 'Total only' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Per color' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Per color × size' }),
    ).toBeNull()
  })

  it('validates missing quantity only when the route entry is submitted', () => {
    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.getByText('Enter at least one quantity')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Review item' })).toBeNull()
  })

  it('places route-prefilled exchange rates before the inline item Done button', () => {
    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    const rmbLabel = screen.getByText('RMB per 1 USD *')
    const ugxLabel = screen.getByText('UGX per 1 USD *')
    const inlineDone = screen.getByRole('button', { name: 'Done' })

    expect(screen.getByDisplayValue('7.25')).toBeTruthy()
    expect(screen.getByDisplayValue('3,750')).toBeTruthy()
    expect(screen.getAllByText('RMB per 1 USD *')).toHaveLength(1)
    expect(screen.getAllByText('UGX per 1 USD *')).toHaveLength(1)
    expect(
      rmbLabel.compareDocumentPosition(inlineDone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      ugxLabel.compareDocumentPosition(inlineDone) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('hides the standalone create button while the inline item editor is open', () => {
    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /create new item/i }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Preview item' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('button', { name: /create new item/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })

  it('opens preview after catalog Done when the route draft is already valid', async () => {
    getItemByArticle.mockResolvedValue(item)
    renderNewForm()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Review item' })).toBeTruthy(),
    )
    expect(addSupplyRouteVariants).not.toHaveBeenCalled()
  })

  it('opens preview before persistence', () => {
    renderNewForm()
    submitDraft()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Review item' })).toBeTruthy()
    expect(
      within(screen.getByRole('dialog')).getByText(/Crew-neck T-shirt/),
    ).toBeTruthy()
    expect(addSupplyRouteVariants).not.toHaveBeenCalled()
  })

  it('clears the supplier error after a supplier is selected', () => {
    resolveDefaultPurchaseSupplierId.mockReturnValue('')
    renderNewForm()
    submitDraft()

    expect(screen.getByText('Select a purchase supplier')).toBeTruthy()

    Element.prototype.scrollIntoView = vi.fn()
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Supplier One' }))

    expect(screen.queryByText('Select a purchase supplier')).toBeNull()
  })

  it('returns to the form on Edit without persisting the draft', () => {
    renderNewForm()
    submitDraft()

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Edit item',
      }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
    expect(addSupplyRouteVariants).not.toHaveBeenCalled()
  })

  it('saves and resets the form when Add another item is confirmed', async () => {
    const { onSaved, onDone } = renderNewForm()
    submitDraft()

    fireEvent.click(screen.getByRole('button', { name: 'Add another item' }))

    await waitFor(() => expect(addSupplyRouteVariants).toHaveBeenCalledTimes(1))
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Select item' })).toBeTruthy()
  })

  it('saves and invokes Done when the user finishes the item step', async () => {
    const { onSaved, onDone } = renderNewForm()
    submitDraft()

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Done',
      }),
    )

    await waitFor(() => expect(addSupplyRouteVariants).toHaveBeenCalledTimes(1))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('keeps the preview and draft when confirmation persistence fails', async () => {
    addSupplyRouteVariants.mockRejectedValueOnce(new Error('Could not save'))
    const { onSaved } = renderNewForm()
    submitDraft()

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Add another item',
      }),
    )

    await waitFor(() =>
      expect(screen.getAllByText('Could not save').length).toBeGreaterThan(0),
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('uses Save changes and replace persistence for an existing entry', async () => {
    getItemByArticle.mockResolvedValue(item)
    render(
      <AddItemForm
        supplyRouteId="route-1"
        rateUgxPerUsd="3750"
        rateRmbPerUsd="7.25"
        suppliers={[{ id: 'supplier-1', name: 'Supplier One' }]}
        onSaved={vi.fn()}
        onDone={vi.fn()}
        initialEntry={{
          entryId: 'entry-1',
          itemId: item.id,
          articleNumber: item.articleNumbers[0]?.articleNumber ?? '',
          supplierId: 'supplier-1',
          foreignCurrency: 'RMB',
          exchangeRateForeignToUsd: '7.25',
          exchangeRateUsdToUgx: '3750',
          cells: [{ itemColorId: 'color-1', size: 'M', quantity: 2 }],
        }}
      />,
    )

    await waitFor(() =>
      expect(screen.getByText(/Crew-neck T-shirt/)).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Add another item' }),
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(replaceSupplyRouteEntry).toHaveBeenCalledTimes(1),
    )
  })
})
