import * as React from 'react'
import { useEffect, useState } from 'react'
import { deriveSizes } from '#/lib/variants'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { FieldLabel } from '#/components/ui/field-label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { Edit, Plus } from 'lucide-react'
import {
  addSupplyRouteVariants,
  replaceSupplyRouteEntry,
} from '#/server/functions/supply/items'
import { ItemPicker } from '#/components/items/item-picker'
import type { ItemSummary } from '#/components/items/item-picker'
import { ItemEditor } from '#/components/items/item-editor'
import { ColorEditor } from '#/components/items/color-editor'
import { VariantGrid } from '#/components/items/variant-grid'
import { ColorQuantityList } from '#/components/supply/split-item-form'
import { getItemByArticle, updateItem } from '#/server/functions/items/items'
import { deleteItemColor } from '#/server/functions/items/colors'
import { resolveDefaultPurchaseSupplierId } from '#/lib/supply-item-supplier-default'

export interface AddItemSupplierOption {
  id: string
  name: string
}

export interface SupplyRouteEntryDraft {
  entryId: string
  itemId: string
  articleNumber: string
  supplierId: string
  foreignCurrency: string
  exchangeRateForeignToUsd: string | null
  exchangeRateUsdToUgx: string | null
  cells: Array<{
    itemColorId?: string
    size?: string
    quantity: number
  }>
}

export function AddItemForm({
  supplyRouteId,
  rateUgxPerUsd,
  rateRmbPerUsd,
  categories,
  suppliers,
  onSuccess,
  initialEntry,
}: {
  supplyRouteId: string
  rateUgxPerUsd?: string | null
  rateRmbPerUsd?: string | null
  categories: ReadonlyArray<string>
  suppliers?: ReadonlyArray<AddItemSupplierOption>
  onSuccess: () => void
  initialEntry?: SupplyRouteEntryDraft
}) {
  const [pending, setPending] = useState(false)
  const [product, setProduct] = useState<ItemSummary | undefined>()
  const [itemEditorMode, setItemEditorMode] = useState<
    'create' | 'edit' | null
  >(initialEntry ? null : 'create')
  const [colorEditorOpen, setColorEditorOpen] = useState(false)
  const [detailMode, setDetailMode] = useState<
    'aggregate' | 'colors' | 'variants'
  >('variants')
  const [aggregateQty, setAggregateQty] = useState('')
  const [colorQtys, setColorQtys] = useState<Record<string, number>>({})
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('')
  const initialCurrency = 'RMB'
  const initialFxToUsd = rateRmbPerUsd ?? ''
  const [currency, setCurrency] = useState<string>(initialCurrency)
  const [fxToUsd, setFxToUsd] = useState(initialFxToUsd)
  const [usdToUgx, setUsdToUgx] = useState(rateUgxPerUsd ?? '')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [hasAddedItem, setHasAddedItem] = useState(false)

  useEffect(() => {
    setItemEditorMode(initialEntry ? null : 'create')
  }, [initialEntry])

  useEffect(() => {
    if (!initialEntry) return
    setPurchaseSupplierId(initialEntry.supplierId)
    setCurrency(initialEntry.foreignCurrency)
    setFxToUsd(
      initialEntry.exchangeRateForeignToUsd ??
        (initialEntry.foreignCurrency === 'RMB' ? (rateRmbPerUsd ?? '') : ''),
    )
    setUsdToUgx(initialEntry.exchangeRateUsdToUgx ?? rateUgxPerUsd ?? '')
    const isAggregate = initialEntry.cells.every(
      (cell) => !cell.itemColorId && !cell.size,
    )
    const isColorOnly = initialEntry.cells.every(
      (cell) => !!cell.itemColorId && !cell.size,
    )
    if (isAggregate) {
      setDetailMode('aggregate')
      setAggregateQty(String(initialEntry.cells[0]?.quantity ?? ''))
    } else if (isColorOnly) {
      setDetailMode('colors')
      setColorQtys(
        Object.fromEntries(
          initialEntry.cells
            .filter((cell) => cell.itemColorId)
            .map((cell) => [cell.itemColorId, cell.quantity]),
        ),
      )
    } else {
      setDetailMode('variants')
      setQuantities(
        Object.fromEntries(
          initialEntry.cells
            .filter((cell) => cell.itemColorId && cell.size)
            .map((cell) => [`${cell.itemColorId}|${cell.size}`, cell.quantity]),
        ),
      )
    }
    void getItemByArticle({
      data: { articleNumber: initialEntry.articleNumber },
    }).then((selected) => {
      if (selected) setProduct(selected)
    })
  }, [initialEntry, rateRmbPerUsd, rateUgxPerUsd])

  async function refreshProduct(articleNumber: string) {
    const p = await getItemByArticle({ data: { articleNumber } })
    if (p) {
      setProduct(p)
      setPurchaseSupplierId(
        resolveDefaultPurchaseSupplierId({
          itemSupplierId: p.supplier?.id,
          routeSupplierIds: suppliers?.map((supplier) => supplier.id) ?? [],
          existingEntrySupplierId: initialEntry?.supplierId,
        }),
      )
    }
  }

  async function handleRemoveColor(itemColorId: string) {
    if (!product) return
    const colorName =
      product.colors.find((c) => c.id === itemColorId)?.colorName ??
      'this color'
    if (!confirm(`Remove "${colorName}" from this product?`)) return
    try {
      await deleteItemColor({ data: { id: itemColorId } })
      setQuantities((prev) => {
        const next = { ...prev }
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${itemColorId}|`)) delete next[key]
        }
        return next
      })
      setColorQtys((prev) => {
        if (!(itemColorId in prev)) return prev
        const next = { ...prev }
        delete next[itemColorId]
        return next
      })
      await refreshProduct(product.articleNumber)
      setFormErrors((prev) => {
        if (!prev.removeColor) return prev
        const { removeColor: _, ...rest } = prev
        return rest
      })
    } catch (err) {
      setFormErrors((prev) => ({
        ...prev,
        removeColor:
          err instanceof Error
            ? err.message
            : `Could not remove "${colorName}" — it may be in use.`,
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (itemEditorMode) return
    const cells: Array<{
      itemColorId?: string
      size?: string
      quantity: number
    }> =
      detailMode === 'aggregate'
        ? aggregateQty && Number(aggregateQty) > 0
          ? [{ quantity: Number(aggregateQty) }]
          : []
        : detailMode === 'colors'
          ? Object.entries(colorQtys)
              .filter(([, quantity]) => quantity > 0)
              .map(([itemColorId, quantity]) => ({ itemColorId, quantity }))
          : Object.entries(quantities)
              .filter(([, quantity]) => quantity > 0)
              .map(([key, quantity]) => {
                const [itemColorId, size] = key.split('|')
                return { itemColorId, size, quantity }
              })

    const errors: Record<string, string> = {}
    if (!product) errors.product = 'Pick a product'
    if (cells.length === 0) errors.quantities = 'Enter at least one quantity'
    if (suppliers?.length && !purchaseSupplierId) {
      errors.supplier = 'Select a purchase supplier'
    }
    if (currency !== 'UGX') {
      if (currency !== 'USD' && (!fxToUsd || Number(fxToUsd) <= 0)) {
        errors.fxToUsd = 'Enter a valid rate'
      }
      if (!usdToUgx || Number(usdToUgx) <= 0) {
        errors.usdToUgx = 'Enter a valid rate'
      }
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0 || !product) return

    setPending(true)
    try {
      if (purchaseSupplierId && product.supplier?.id !== purchaseSupplierId) {
        const selectedSupplier = suppliers?.find(
          (supplier) => supplier.id === purchaseSupplierId,
        )
        const makeCurrent = window.confirm(
          `Make ${selectedSupplier?.name ?? 'this supplier'} the current supplier for ${product.name}? Cancel keeps the current item supplier and uses this supplier only for this route entry.`,
        )
        if (makeCurrent) {
          await updateItem({
            data: { id: product.id, supplierId: purchaseSupplierId },
          })
        }
      }
      const entryData = {
        supplyRouteId,
        itemId: product.id,
        supplierId: purchaseSupplierId || undefined,
        exchangeRateForeignToUsd:
          currency !== 'UGX' && currency !== 'USD'
            ? fxToUsd || undefined
            : undefined,
        exchangeRateUsdToUgx:
          currency !== 'UGX' ? usdToUgx || undefined : undefined,
        cells,
      }
      if (initialEntry) {
        await replaceSupplyRouteEntry({
          data: { ...entryData, entryId: initialEntry.entryId },
        })
      } else {
        await addSupplyRouteVariants({ data: entryData })
      }
      onSuccess()
      setHasAddedItem(true)
      setProduct(undefined)
      setDetailMode('variants')
      setAggregateQty('')
      setColorQtys({})
      setQuantities({})
      setPurchaseSupplierId('')
      setFormErrors({})
    } catch (err) {
      setFormErrors({
        form: err instanceof Error ? err.message : 'Failed to save',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e)
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <FieldLabel help="item.name">Item *</FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <ItemPicker
              value={product?.id}
              allowArchived
              onChange={(_, selected) => {
                setProduct(selected)
                setItemEditorMode(null)
                setPurchaseSupplierId(
                  resolveDefaultPurchaseSupplierId({
                    itemSupplierId: selected?.supplier?.id,
                    routeSupplierIds:
                      suppliers?.map((supplier) => supplier.id) ?? [],
                    existingEntrySupplierId: initialEntry?.supplierId,
                  }),
                )
                setQuantities({})
                if (
                  selected?.costCurrency === 'RMB' ||
                  selected?.costCurrency === 'USD' ||
                  selected?.costCurrency === 'UGX'
                ) {
                  setCurrency(selected.costCurrency)
                }
              }}
              onCreateNew={() => setItemEditorMode('create')}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => setItemEditorMode('create')}
          >
            <Plus className="size-4" /> Create new item
          </Button>
        </div>
        {formErrors.product && (
          <p className="text-xs text-destructive">{formErrors.product}</p>
        )}
      </div>

      {itemEditorMode && (
        <section
          className="rounded-md border bg-muted/20 p-4"
          aria-label={
            itemEditorMode === 'create' ? 'New item' : 'Edit item details'
          }
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-medium">
              {itemEditorMode === 'create' ? 'New item' : 'Edit item details'}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setItemEditorMode(null)}
            >
              Cancel
            </Button>
          </div>
          {itemEditorMode === 'create' ? (
            <ItemEditor
              categories={categories}
              onCreated={(_id, articleNumber) => {
                setItemEditorMode(null)
                void refreshProduct(articleNumber)
              }}
            />
          ) : product ? (
            <ItemEditor
              categories={categories}
              suppliers={suppliers}
              item={product}
              onUpdated={(articleNumber) => {
                setItemEditorMode(null)
                void refreshProduct(articleNumber)
              }}
            />
          ) : null}
        </section>
      )}

      {product && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {product.articleNumber} — {product.name}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setColorEditorOpen(true)}
            >
              <Plus className="mr-1 size-3" /> Add color
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setItemEditorMode('edit')}
            >
              <Edit className="mr-1 size-3" /> Edit item
            </Button>
          </div>

          {suppliers && suppliers.length > 0 && (
            <div className="space-y-2">
              <FieldLabel help="item.supplierId">
                Purchase supplier *
              </FieldLabel>
              <Select
                value={purchaseSupplierId}
                onValueChange={setPurchaseSupplierId}
              >
                <SelectTrigger
                  aria-invalid={!!formErrors.supplier || undefined}
                >
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.supplier && (
                <p className="text-xs text-destructive">
                  {formErrors.supplier}
                </p>
              )}
              {product.supplier &&
                product.supplier.id !== purchaseSupplierId && (
                  <p className="text-xs text-muted-foreground">
                    Item current supplier: {product.supplier.name}. This
                    purchase supplier is saved only for this route entry.
                  </p>
                )}
            </div>
          )}

          <div className="space-y-1.5">
            <FieldLabel help="item.detailMode">Detail level</FieldLabel>
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              {(
                [
                  { value: 'aggregate', label: 'Total only' },
                  { value: 'colors', label: 'Per color' },
                  { value: 'variants', label: 'Per color × size' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDetailMode(option.value)}
                  className={
                    'rounded px-3 py-1.5 transition-colors ' +
                    (detailMode === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted')
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {detailMode === 'aggregate'
                ? "Just record how many units you're buying. An admin can split into colors/sizes later before receiving."
                : detailMode === 'colors'
                  ? 'Record quantity per color. Sizes can be filled in later.'
                  : 'Full breakdown by color and size.'}
            </p>
          </div>

          {detailMode === 'aggregate' && (
            <div className="space-y-2">
              <FieldLabel help="item.aggregateQty">Total quantity *</FieldLabel>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={aggregateQty}
                onChange={(event) => setAggregateQty(event.target.value)}
                placeholder="0"
                aria-invalid={!!formErrors.quantities || undefined}
              />
              {formErrors.quantities && (
                <p className="text-xs text-destructive">
                  {formErrors.quantities}
                </p>
              )}
            </div>
          )}

          {detailMode === 'colors' && (
            <ColorQuantityList
              colors={product.colors}
              values={colorQtys}
              onChange={setColorQtys}
              onRemoveColor={(id) => void handleRemoveColor(id)}
              error={formErrors.quantities}
            />
          )}

          {detailMode === 'variants' && (
            <>
              <VariantGrid
                sizes={deriveSizes(product.variants ?? [])}
                colors={product.colors}
                quantities={quantities}
                onChange={setQuantities}
                onRemoveColor={(id) => void handleRemoveColor(id)}
              />
              {formErrors.quantities && (
                <p className="text-xs text-destructive">
                  {formErrors.quantities}
                </p>
              )}
            </>
          )}
          {formErrors.removeColor && (
            <p className="text-xs text-destructive">{formErrors.removeColor}</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Supplier and purchase cost come from the item by default. Purchase
        supplier and optional rates can be overridden for this line.
      </p>

      {currency !== 'UGX' && (
        <div className="grid grid-cols-2 gap-4">
          {currency !== 'USD' && (
            <div className="space-y-2">
              <FieldLabel help="item.sourceRate">
                {currency} per 1 USD *
              </FieldLabel>
              <MoneyInput
                currency={`${currency}/USD`}
                value={fxToUsd}
                onChange={setFxToUsd}
                decimals={6}
                placeholder="e.g. 7.25"
                error={formErrors.fxToUsd}
              />
            </div>
          )}
          <div className="space-y-2">
            <FieldLabel help="item.ugxPerUsd">UGX per 1 USD *</FieldLabel>
            <MoneyInput
              currency="UGX/USD"
              value={usdToUgx}
              onChange={setUsdToUgx}
              decimals={0}
              placeholder="e.g. 3750"
              error={formErrors.usdToUgx}
            />
          </div>
        </div>
      )}

      {formErrors.form && (
        <p className="text-sm text-destructive">{formErrors.form}</p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={pending || !!itemEditorMode}
      >
        {pending
          ? 'Saving...'
          : initialEntry
            ? 'Save changes'
            : hasAddedItem
              ? 'Add another item'
              : 'Add Items'}
      </Button>

      <Dialog open={colorEditorOpen} onOpenChange={setColorEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add color</DialogTitle>
          </DialogHeader>
          {product && (
            <ColorEditor
              itemId={product.id}
              onCreated={() => {
                setColorEditorOpen(false)
                void refreshProduct(product.articleNumber)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </form>
  )
}
