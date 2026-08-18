import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { deriveSizes } from '#/lib/variants'
import { Button } from '#/components/ui/button'
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
  ResponsiveDialogFooter as DialogFooter,
} from '#/components/ui/responsive-dialog'
import { Edit, Plus } from 'lucide-react'
import {
  addSupplyRouteVariants,
  replaceSupplyRouteEntry,
} from '#/server/functions/supply/items'
import { SupplyRouteItemPicker } from '#/components/supply/supply-route-item-picker'
import type { ItemSummary } from '#/components/items/item-picker'
import { ItemEditor } from '#/components/items/item-editor'
import type { ItemEditorDraft } from '#/components/items/item-editor'
import { ColorEditor } from '#/components/items/color-editor'
import { DetailLevelFields } from '#/components/supply/detail-level-fields'
import {
  buildDetailCells,
  normalizeDetailMode as normalizeDetailModeForAttributes,
} from '#/lib/supply/detail-level'
import type { DetailMode } from '#/lib/supply/detail-level'
import { getItemByArticle, updateItem } from '#/server/functions/items/items'
import { deleteItemColor } from '#/server/functions/items/colors'
import { resolveDefaultPurchaseSupplierId } from '#/lib/supply-item-supplier-default'
import {
  formatItemArticleNumbers,
  primaryItemArticleNumber,
} from '#/lib/items/article-number'

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

function normalizeDetailMode(
  mode: DetailMode,
  product: ItemSummary | undefined,
): DetailMode {
  return normalizeDetailModeForAttributes(
    mode,
    product?.colors ?? [],
    product ? deriveSizes(product.variants ?? []) : [],
  )
}

type SupplyRouteEntryPayload = {
  supplyRouteId: string
  itemId: string
  supplierId?: string
  exchangeRateForeignToUsd?: string
  exchangeRateUsdToUgx?: string
  cells: Array<{
    itemColorId?: string
    size?: string
    quantity: number
  }>
}

type PendingSupplyRouteEntry = {
  payload: SupplyRouteEntryPayload
  product: ItemSummary
  supplierName: string
  currency: string
  exchangeRateForeignToUsd?: string
  exchangeRateUsdToUgx?: string
  detailMode: 'aggregate' | 'colors' | 'variants'
}

export function AddItemForm({
  supplyRouteId,
  rateUgxPerUsd,
  rateRmbPerUsd,
  suppliers,
  onSaved,
  onDone,
  initialEntry,
}: {
  supplyRouteId: string
  rateUgxPerUsd?: string | null
  rateRmbPerUsd?: string | null
  suppliers?: ReadonlyArray<AddItemSupplierOption>
  onSaved: () => void | Promise<void>
  onDone: () => void | Promise<void>
  initialEntry?: SupplyRouteEntryDraft
}) {
  const [pending, setPending] = useState(false)
  const [product, setProduct] = useState<ItemSummary | undefined>()
  const [itemEditorMode, setItemEditorMode] = useState<
    'create' | 'edit' | null
  >(initialEntry ? null : 'create')
  const [colorEditorOpen, setColorEditorOpen] = useState(false)
  const [detailMode, setDetailMode] = useState<DetailMode>('aggregate')
  const [aggregateQty, setAggregateQty] = useState('')
  const [colorQtys, setColorQtys] = useState<Record<string, number>>({})
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [newItemDraft, setNewItemDraft] = useState<ItemEditorDraft>({
    supplierId: '',
    costCurrency: 'RMB',
    colors: [],
    sizes: [],
  })
  const handleNewItemDraftChange = useCallback((draft: ItemEditorDraft) => {
    setNewItemDraft(draft)
    setCurrency(draft.costCurrency)
    const draftColorIds = new Set(
      draft.colors.map((color) => color.id ?? `draft:${color.colorName}`),
    )
    const draftSizes = new Set(draft.sizes)
    setColorQtys((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([colorId]) =>
          draftColorIds.has(colorId),
        ),
      ),
    )
    setQuantities((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => {
          const separator = key.indexOf('|')
          return (
            separator > 0 &&
            draftColorIds.has(key.slice(0, separator)) &&
            draftSizes.has(key.slice(separator + 1))
          )
        }),
      ),
    )
    setDetailMode((current) =>
      normalizeDetailModeForAttributes(
        current,
        draft.colors.map((color) => ({
          id: color.id ?? `draft:${color.colorName}`,
          colorName: color.colorName,
          colorHex: color.colorHex,
        })),
        draft.sizes,
      ),
    )
  }, [])

  function resetNewItemDraft() {
    setNewItemDraft({
      supplierId: '',
      costCurrency: 'RMB',
      colors: [],
      sizes: [],
    })
    setDetailMode('aggregate')
    setAggregateQty('')
    setColorQtys({})
    setQuantities({})
    setFormErrors({})
  }
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('')
  const [supplierOptions, setSupplierOptions] = useState<
    ReadonlyArray<AddItemSupplierOption>
  >(suppliers ?? [])
  const initialCurrency = 'RMB'
  const initialFxToUsd = rateRmbPerUsd ?? ''
  const [currency, setCurrency] = useState<string>(initialCurrency)
  const [fxToUsd, setFxToUsd] = useState(initialFxToUsd)
  const [usdToUgx, setUsdToUgx] = useState(rateUgxPerUsd ?? '')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [pendingPreview, setPendingPreview] =
    useState<PendingSupplyRouteEntry | null>(null)

  useEffect(() => {
    setItemEditorMode(initialEntry ? null : 'create')
  }, [initialEntry])

  useEffect(() => {
    setSupplierOptions(suppliers ?? [])
  }, [suppliers])

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
    })
      .then((selected) => {
        if (selected) {
          setProduct(selected)
          setDetailMode((current) => normalizeDetailMode(current, selected))
        }
      })
      .catch((err: unknown) => {
        setFormErrors({
          form:
            err instanceof Error
              ? err.message
              : 'Could not load the existing item',
        })
      })
  }, [initialEntry, rateRmbPerUsd, rateUgxPerUsd])

  async function refreshProduct(
    articleNumber: string,
  ): Promise<ItemSummary | undefined> {
    const p = await getItemByArticle({ data: { articleNumber } })
    if (p) {
      setProduct(p)
      setDetailMode((current) => normalizeDetailMode(current, p))
      if (p.supplier) {
        const itemSupplier = p.supplier
        setSupplierOptions((current) => {
          if (current.some((supplier) => supplier.id === itemSupplier.id)) {
            return current
          }
          return [...current, itemSupplier].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        })
      }
      setPurchaseSupplierId(
        resolveDefaultPurchaseSupplierId({
          itemSupplierId: p.supplier?.id,
          supplierIds: supplierOptions.map((supplier) => supplier.id),
          existingEntrySupplierId: initialEntry?.supplierId,
        }),
      )
    }
    return p
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
      await refreshProduct(primaryItemArticleNumber(product.articleNumbers))
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

  function openPreviewForProduct(selectedProduct: ItemSummary | undefined) {
    const activeDetailMode = normalizeDetailMode(detailMode, selectedProduct)
    const cells = buildDetailCells(
      activeDetailMode,
      aggregateQty,
      colorQtys,
      quantities,
    )

    const errors: Record<string, string> = {}
    if (!selectedProduct) errors.product = 'Pick a product'
    if (cells.length === 0) errors.quantities = 'Enter at least one quantity'
    if (supplierOptions.length > 0 && !purchaseSupplierId) {
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
    if (Object.keys(errors).length > 0 || !selectedProduct) return
    setDetailMode(activeDetailMode)

    const entryData: SupplyRouteEntryPayload = {
      supplyRouteId,
      itemId: selectedProduct.id,
      supplierId: purchaseSupplierId || undefined,
      exchangeRateForeignToUsd:
        currency !== 'UGX' && currency !== 'USD'
          ? fxToUsd || undefined
          : undefined,
      exchangeRateUsdToUgx:
        currency !== 'UGX' ? usdToUgx || undefined : undefined,
      cells,
    }
    const selectedSupplier = supplierOptions.find(
      (supplier) => supplier.id === purchaseSupplierId,
    )
    setPendingPreview({
      payload: entryData,
      product: selectedProduct,
      supplierName:
        selectedSupplier?.name ?? selectedProduct.supplier?.name ?? 'Not set',
      currency,
      exchangeRateForeignToUsd: fxToUsd || undefined,
      exchangeRateUsdToUgx: usdToUgx || undefined,
      detailMode: activeDetailMode,
    })
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (itemEditorMode) return
    openPreviewForProduct(product)
  }

  function resetForm() {
    setProduct(undefined)
    setDetailMode('aggregate')
    setAggregateQty('')
    setColorQtys({})
    setQuantities({})
    setPurchaseSupplierId('')
    setCurrency(initialCurrency)
    setFxToUsd(initialFxToUsd)
    setUsdToUgx(rateUgxPerUsd ?? '')
    setFormErrors({})
  }

  async function confirmPending(action: 'another' | 'done' | 'save') {
    if (!pendingPreview || pending) return
    setPending(true)
    setFormErrors({})
    let saved = false
    try {
      const { payload, product: pendingProduct } = pendingPreview
      if (
        payload.supplierId &&
        pendingProduct.supplier?.id !== payload.supplierId
      ) {
        const selectedSupplier = supplierOptions.find(
          (supplier) => supplier.id === payload.supplierId,
        )
        const makeCurrent = window.confirm(
          `Make ${selectedSupplier?.name ?? 'this supplier'} the current supplier for ${pendingProduct.name}? Cancel keeps the current item supplier and uses this supplier only for this route entry.`,
        )
        if (makeCurrent) {
          await updateItem({
            data: { id: pendingProduct.id, supplierId: payload.supplierId },
          })
        }
      }
      if (initialEntry) {
        await replaceSupplyRouteEntry({
          data: { ...payload, entryId: initialEntry.entryId },
        })
      } else {
        await addSupplyRouteVariants({ data: payload })
      }
      saved = true
    } catch (err) {
      setFormErrors({
        form: err instanceof Error ? err.message : 'Failed to save',
      })
    } finally {
      setPending(false)
    }
    if (!saved) return

    setPendingPreview(null)
    if (initialEntry || action === 'another') {
      if (action === 'another') resetForm()
      await onSaved()
    } else {
      await onDone()
    }
  }

  const exchangeRateFields =
    currency !== 'UGX' ? (
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
    ) : null

  const newItemDetailColors = newItemDraft.colors.map((color) => ({
    id: color.id ?? `draft:${color.colorName}`,
    colorName: color.colorName,
    colorHex: color.colorHex,
  }))
  const newItemDetailMode = normalizeDetailModeForAttributes(
    detailMode,
    newItemDetailColors,
    newItemDraft.sizes,
  )

  function validateNewItemRouteDraft() {
    const cells = buildDetailCells(
      newItemDetailMode,
      aggregateQty,
      colorQtys,
      quantities,
    )
    const errors: Record<string, string> = {}
    if (cells.length === 0) errors.quantities = 'Enter at least one quantity'
    if (supplierOptions.length > 0 && !newItemDraft.supplierId) {
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
    return Object.keys(errors).length === 0
  }

  async function saveNewItemRouteEntry(_itemId: string, articleNumber: string) {
    // Keep the new-item editor as the only visible form if the route write
    // fails. `refreshProduct` also sets the outer selected product state,
    // which would expose a second route form during retry.
    const selectedProduct = await getItemByArticle({
      data: { articleNumber },
    })
    if (!selectedProduct) throw new Error('Could not load the new item')

    const draftCells = buildDetailCells(
      newItemDetailMode,
      aggregateQty,
      colorQtys,
      quantities,
    )
    const colorIdByDraftId = new Map(
      newItemDetailColors.map((draftColor) => [
        draftColor.id,
        selectedProduct.colors.find(
          (color) => color.colorName === draftColor.colorName,
        )?.id,
      ]),
    )
    const cells = draftCells.map((cell) => {
      if (!cell.itemColorId) return cell
      const itemColorId = colorIdByDraftId.get(cell.itemColorId)
      if (!itemColorId) {
        throw new Error(`Could not map color ${cell.itemColorId}`)
      }
      return { ...cell, itemColorId }
    })

    await addSupplyRouteVariants({
      data: {
        supplyRouteId,
        itemId: selectedProduct.id,
        supplierId: newItemDraft.supplierId || undefined,
        exchangeRateForeignToUsd:
          currency !== 'UGX' && currency !== 'USD'
            ? fxToUsd || undefined
            : undefined,
        exchangeRateUsdToUgx:
          currency !== 'UGX' ? usdToUgx || undefined : undefined,
        cells,
      },
    })
    setItemEditorMode(null)
    await onDone()
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
            <SupplyRouteItemPicker
              value={product?.id}
              allowArchived
              onChange={(_, selected) => {
                setProduct(selected)
                setItemEditorMode(null)
                setDetailMode('aggregate')
                setPurchaseSupplierId(
                  resolveDefaultPurchaseSupplierId({
                    itemSupplierId: selected?.supplier?.id,
                    supplierIds: supplierOptions.map((supplier) => supplier.id),
                    existingEntrySupplierId: initialEntry?.supplierId,
                  }),
                )
                setAggregateQty('')
                setColorQtys({})
                setQuantities({})
                setFormErrors({})
                if (
                  selected?.costCurrency === 'RMB' ||
                  selected?.costCurrency === 'USD' ||
                  selected?.costCurrency === 'UGX'
                ) {
                  setCurrency(selected.costCurrency)
                }
              }}
            />
          </div>
          {!itemEditorMode && (
            <Button
              type="button"
              variant="outline"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => {
                resetNewItemDraft()
                setItemEditorMode('create')
              }}
            >
              <Plus className="size-4" /> Create new item
            </Button>
          )}
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
              onClick={() => {
                resetNewItemDraft()
                setItemEditorMode(null)
              }}
            >
              Cancel
            </Button>
          </div>
          {itemEditorMode === 'create' ? (
            <ItemEditor
              suppliers={supplierOptions}
              allowCreateSupplier
              createSubmitLabel="Done"
              onDraftChange={handleNewItemDraftChange}
              beforeSubmit={validateNewItemRouteDraft}
              beforeSubmitContent={
                <>
                  {exchangeRateFields}
                  <DetailLevelFields
                    colors={newItemDetailColors}
                    sizes={newItemDraft.sizes}
                    detailMode={newItemDetailMode}
                    onDetailModeChange={(mode) => {
                      setDetailMode(mode)
                      setFormErrors((prev) => {
                        if (!prev.quantities) return prev
                        const { quantities: _, ...rest } = prev
                        return rest
                      })
                    }}
                    aggregateQty={aggregateQty}
                    onAggregateQtyChange={setAggregateQty}
                    colorQtys={colorQtys}
                    onColorQtysChange={setColorQtys}
                    quantities={quantities}
                    onQuantitiesChange={setQuantities}
                    error={formErrors.quantities}
                  />
                </>
              }
              onCreated={saveNewItemRouteEntry}
            />
          ) : product ? (
            <ItemEditor
              suppliers={supplierOptions}
              allowCreateSupplier
              beforeSubmitContent={exchangeRateFields}
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
              {formatItemArticleNumbers(product.articleNumbers)} —{' '}
              {product.name}
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

          {supplierOptions.length > 0 && (
            <div className="space-y-2">
              <FieldLabel help="item.supplierId">
                Purchase supplier *
              </FieldLabel>
              <Select
                value={purchaseSupplierId}
                onValueChange={(value) => {
                  setPurchaseSupplierId(value)
                  setFormErrors((prev) => {
                    if (!prev.supplier) return prev
                    const { supplier: _, ...rest } = prev
                    return rest
                  })
                }}
              >
                <SelectTrigger
                  aria-invalid={!!formErrors.supplier || undefined}
                >
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map((supplier) => (
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

          <DetailLevelFields
            colors={product.colors}
            sizes={deriveSizes(product.variants ?? [])}
            detailMode={normalizeDetailMode(detailMode, product)}
            onDetailModeChange={(mode) => {
              setDetailMode(mode)
              setFormErrors((prev) => {
                if (!prev.quantities) return prev
                const { quantities: _, ...rest } = prev
                return rest
              })
            }}
            aggregateQty={aggregateQty}
            onAggregateQtyChange={setAggregateQty}
            colorQtys={colorQtys}
            onColorQtysChange={setColorQtys}
            quantities={quantities}
            onQuantitiesChange={setQuantities}
            error={formErrors.quantities}
            onRemoveColor={(id) => void handleRemoveColor(id)}
          />
          {formErrors.removeColor && (
            <p className="text-xs text-destructive">{formErrors.removeColor}</p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Supplier and purchase cost come from the item by default. Purchase
        supplier and optional rates can be overridden for this line.
      </p>

      {!itemEditorMode && exchangeRateFields}

      {formErrors.form && (
        <p className="text-sm text-destructive">{formErrors.form}</p>
      )}

      {!itemEditorMode && (
        <Button type="submit" className="w-full" disabled={pending}>
          Done
        </Button>
      )}

      <Dialog
        open={!!pendingPreview}
        onOpenChange={(open) => {
          if (!open && !pending) setPendingPreview(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review item</DialogTitle>
          </DialogHeader>
          {pendingPreview && (
            <div className="space-y-4 text-sm">
              <div className="rounded-md border p-3">
                <p className="font-medium">
                  {formatItemArticleNumbers(
                    pendingPreview.product.articleNumbers,
                  )}{' '}
                  — {pendingPreview.product.name}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Supplier: {pendingPreview.supplierName}
                </p>
                <p className="text-muted-foreground">
                  Cost: {pendingPreview.product.costPrice ?? 'Not set'}{' '}
                  {pendingPreview.currency}
                </p>
                <p className="text-muted-foreground">
                  Minimum sell price:{' '}
                  {pendingPreview.product.minimumSellPriceUgx ?? 'Not set'} UGX
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-medium">
                  Quantity details ({pendingPreview.detailMode})
                </p>
                <ul className="space-y-1 rounded-md border p-3">
                  {pendingPreview.payload.cells.map((cell, index) => {
                    const color = cell.itemColorId
                      ? pendingPreview.product.colors.find(
                          (entry) => entry.id === cell.itemColorId,
                        )?.colorName
                      : undefined
                    return (
                      <li
                        key={`${cell.itemColorId ?? 'all'}-${cell.size ?? index}`}
                        className="flex justify-between gap-3"
                      >
                        <span>
                          {color ?? 'All colors'}
                          {cell.size ? ` / ${cell.size}` : ''}
                        </span>
                        <span className="font-mono">{cell.quantity}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              {pendingPreview.currency !== 'UGX' && (
                <div className="rounded-md border p-3 text-muted-foreground">
                  {pendingPreview.currency !== 'USD' && (
                    <p>
                      {pendingPreview.currency}/USD rate:{' '}
                      {pendingPreview.exchangeRateForeignToUsd ?? '—'}
                    </p>
                  )}
                  <p>
                    USD/UGX rate: {pendingPreview.exchangeRateUsdToUgx ?? '—'}
                  </p>
                </div>
              )}
              {formErrors.form && (
                <p className="text-sm text-destructive">{formErrors.form}</p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setPendingPreview(null)}
            >
              Edit item
            </Button>
            {initialEntry ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() => void confirmPending('save')}
              >
                Save changes
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => void confirmPending('another')}
                >
                  Add another item
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void confirmPending('done')}
                >
                  Done
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                void refreshProduct(
                  primaryItemArticleNumber(product.articleNumbers),
                )
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </form>
  )
}
