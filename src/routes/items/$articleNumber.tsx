import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Fragment, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronRight } from 'lucide-react'
import { requireUiPermission, useCan } from '#/lib/permissions'
import {
  getItemByArticle,
  archiveItem,
  deleteItem,
  restoreItem,
} from '#/server/functions/items/items'
import {
  listItemStockPrices,
  // Plan 2b removed setShopStockMinimumPrice — shop floors are item-wide now.
  setItemMinimumSellPrice,
  updateItemCommercialProfile,
} from '#/server/functions/items/prices'
import { listSuppliersForSelect } from '#/server/functions/supply/routes'
import { countVariantStockLocations } from '#/server/functions/items/variant-stock-counts'
import { createVariant, deleteVariant } from '#/server/functions/items/variants'
import { ColorEditor } from '#/components/items/color-editor'
import { ItemImageActions } from '#/components/items/item-image-actions'
import { ItemImageGallery } from '#/components/items/item-image-gallery'
import { DesignEditPopover } from '#/components/items/design-edit-popover'
import { AuditActivityPanel } from '#/components/audit/audit-activity-panel'
import { deriveSizes } from '#/lib/variants'
import { rankColorSuggestions } from '#/lib/colors/rank-suggestions'
import type { RankedColorSuggestion } from '#/lib/colors/rank-suggestions'
import { addItemColor } from '#/server/functions/items/colors'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { Combobox } from '#/components/ui/combobox'
import { Badge } from '#/components/ui/badge'
import { InfoPopover } from '#/components/ui/info-popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { removeItemImage } from '#/server/functions/items/uploads'

export const Route = createFileRoute('/items/$articleNumber')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'items.view'),
  loader: async ({ params }) => {
    const product = await getItemByArticle({
      data: { articleNumber: params.articleNumber, includeArchived: true },
    })
    if (!product) throw new Error(`Product not found: ${params.articleNumber}`)
    const [prices, variantStockCounts] = await Promise.all([
      listItemStockPrices({ data: { itemId: product.id } }),
      countVariantStockLocations({ data: { itemId: product.id } }),
    ])
    return { product, prices, variantStockCounts }
  },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { product, prices, variantStockCounts } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan('items.manage')
  const canSeeActivity = useCan('audit.viewArticleActivity')
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [commercialDialogOpen, setCommercialDialogOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{
    imageS3Key: string
    index: number
  } | null>(null)
  const [removingImageKey, setRemovingImageKey] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [colorSuggestions, setColorSuggestions] = useState<
    RankedColorSuggestion[]
  >([])
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState<
    Set<string>
  >(new Set())
  const [detectingColors, setDetectingColors] = useState(false)
  const [addingSuggestedColors, setAddingSuggestedColors] = useState(false)
  const [colorDetectionMessage, setColorDetectionMessage] = useState('')
  const [activeColorId, setActiveColorId] = useState<string | undefined>(
    product.colors[0]?.id,
  )
  const sizes = deriveSizes(product.variants)

  async function handleRemoveImage() {
    if (!removeTarget) return
    setRemovingImageKey(removeTarget.imageS3Key)
    setRemoveError('')
    try {
      await removeItemImage({
        data: { itemId: product.id, imageS3Key: removeTarget.imageS3Key },
      })
      setRemoveTarget(null)
      await router.invalidate()
    } catch (cause) {
      setRemoveError(
        cause instanceof Error ? cause.message : 'Could not remove photo',
      )
    } finally {
      setRemovingImageKey(null)
    }
  }

  function requestRemoveImage(imageS3Key: string, index: number) {
    setRemoveError('')
    setRemoveTarget({
      imageS3Key,
      index,
    })
  }

  function suggestionKey(
    suggestion: Pick<RankedColorSuggestion, 'name' | 'hex'>,
  ) {
    return `${suggestion.name.trim().toLowerCase()}\u0000${suggestion.hex.toLowerCase()}`
  }

  function handleDetectColors() {
    setDetectingColors(true)
    setMutationError('')
    const suggestions = rankColorSuggestions(
      product.images.flatMap((image) =>
        image.suggestedColorName && image.suggestedColorHex
          ? [
              {
                name: image.suggestedColorName,
                hex: image.suggestedColorHex,
                sampledHex: image.sampledHex ?? image.suggestedColorHex,
              },
            ]
          : [],
      ),
    )
    setColorSuggestions(suggestions)
    setColorDetectionMessage(
      suggestions.length === 0
        ? 'No color could be detected yet. Add a clearer photo and try again.'
        : '',
    )
    const existingNames = new Set(
      product.colors.map((color) => color.colorName.trim().toLowerCase()),
    )
    setSelectedSuggestionKeys(
      new Set(
        suggestions
          .filter(
            (suggestion) =>
              !existingNames.has(suggestion.name.trim().toLowerCase()),
          )
          .map(suggestionKey),
      ),
    )
    setDetectingColors(false)
  }

  async function handleConfirmSuggestedColors() {
    const existingNames = new Set(
      product.colors.map((color) => color.colorName.trim().toLowerCase()),
    )
    const selected = colorSuggestions.filter(
      (suggestion) =>
        selectedSuggestionKeys.has(suggestionKey(suggestion)) &&
        !existingNames.has(suggestion.name.trim().toLowerCase()),
    )
    if (selected.length === 0) return
    setAddingSuggestedColors(true)
    setMutationError('')
    try {
      for (const suggestion of selected) {
        await addItemColor({
          data: {
            itemId: product.id,
            colorName: suggestion.name,
            colorHex: suggestion.hex,
          },
        })
      }
      setColorSuggestions([])
      setSelectedSuggestionKeys(new Set())
      setColorDetectionMessage('')
      await router.invalidate()
    } catch (cause) {
      setMutationError(
        cause instanceof Error
          ? cause.message
          : 'Could not add suggested colors',
      )
    } finally {
      setAddingSuggestedColors(false)
    }
  }

  async function handleArchive() {
    if (!confirm(`Archive "${product.name}"?`)) return
    await archiveItem({ data: { id: product.id } })
    await router.navigate({ to: '/items' })
  }

  async function handleRestore() {
    try {
      await restoreItem({ data: { id: product.id } })
      await router.invalidate()
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : 'Could not restore item',
      )
    }
  }

  async function handlePermanentDelete() {
    if (
      !confirm(
        `Permanently delete "${product.name}"? This is only allowed when it has no historical references.`,
      )
    )
      return
    try {
      await deleteItem({ data: { id: product.id } })
      await router.navigate({ to: '/items' })
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : 'Could not delete item',
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted-foreground">
            {product.articleNumbers
              .map((number) => number.articleNumber)
              .join(', ')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{product.name}</h1>
            <DesignEditPopover
              itemId={product.id}
              current={product.design}
              canEdit={canManage}
              onSaved={() => void router.invalidate()}
            />
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap justify-end gap-2">
            {product.deletedAt ? (
              <Button variant="outline" onClick={() => void handleRestore()}>
                Restore item
              </Button>
            ) : (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => void handleArchive()}
              >
                <Trash2 className="mr-1 size-4" /> Archive item
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => void handlePermanentDelete()}
            >
              Delete permanently
            </Button>
          </div>
        )}
      </div>

      {mutationError && (
        <p className="text-sm text-destructive" role="alert" aria-live="polite">
          {mutationError}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <ItemImageGallery
            itemName={product.name}
            images={product.images}
            canManage={canManage}
            actions={
              canManage ? (
                <ItemImageActions
                  itemId={product.id}
                  onUploaded={() => {
                    setColorDetectionMessage('')
                    setColorSuggestions([])
                    setSelectedSuggestionKeys(new Set())
                    void router.invalidate()
                  }}
                />
              ) : undefined
            }
            onRequestRemove={requestRemoveImage}
            onDetectColors={handleDetectColors}
            detecting={detectingColors}
            suggestions={colorSuggestions}
            existingColorNames={product.colors.map((color) => color.colorName)}
            selectedSuggestionKeys={selectedSuggestionKeys}
            onToggleSuggestion={(key) => {
              setSelectedSuggestionKeys((current) => {
                const next = new Set(current)
                if (next.has(key)) next.delete(key)
                else next.add(key)
                return next
              })
            }}
            onConfirmSuggestions={() => void handleConfirmSuggestedColors()}
            confirming={addingSuggestedColors}
            detectionMessage={colorDetectionMessage}
          />
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Color
            </p>
            <div className="flex flex-wrap gap-1.5">
              {product.colors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === activeColorId}
                  onClick={() => {
                    setActiveColorId(c.id)
                  }}
                  className={`inline-flex touch-manipulation items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${c.id === activeColorId ? 'border-foreground bg-muted font-medium ring-1 ring-foreground/20' : 'hover:bg-muted'}`}
                >
                  <span
                    className="size-3 rounded-full border"
                    style={{ backgroundColor: c.colorHex }}
                    aria-hidden
                  />
                  {c.colorName}
                </button>
              ))}
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setColorDialogOpen(true)}
                >
                  <Plus className="size-3 mr-1" /> Add color
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Sizes</h2>
            <p className="text-sm">{sizes.join(', ') || '—'}</p>
          </div>
          {product.description && (
            <div>
              <h2 className="font-medium">Description</h2>
              <p className="text-sm text-muted-foreground">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <VariantsSection
        itemId={product.id}
        colors={product.colors}
        variants={product.variants}
        stockCounts={variantStockCounts}
        prices={prices}
        canManage={canManage}
        onChanged={() => {
          void router.invalidate()
        }}
      />

      {canManage && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Prices</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCommercialDialogOpen(true)}
              >
                <Pencil className="mr-1 size-3" /> Edit item pricing
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPriceDialogOpen(true)}
              >
                Edit stock floor
              </Button>
            </div>
          </div>
          <PriceSummary prices={prices} />
        </section>
      )}

      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add color</DialogTitle>
            <DialogDescription>
              Choose a color for this item or enter a custom name and hex value.
              Photos are managed in the item gallery.
            </DialogDescription>
          </DialogHeader>
          <ColorEditor
            itemId={product.id}
            onCreated={() => {
              setColorDialogOpen(false)
              void router.invalidate()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removingImageKey) setRemoveTarget(null)
        }}
      >
        <DialogContent className="overscroll-contain">
          <DialogHeader>
            <DialogTitle>Remove photo?</DialogTitle>
            <DialogDescription>
              This removes photo {removeTarget ? removeTarget.index + 1 : ''}{' '}
              from the item gallery. You can add it again later if needed.
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p
              className="text-sm text-destructive"
              role="alert"
              aria-live="polite"
            >
              {removeError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveTarget(null)}
              disabled={removingImageKey !== null}
            >
              Keep photo
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRemoveImage()}
              disabled={removingImageKey !== null}
            >
              {removingImageKey ? 'Removing…' : 'Remove photo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Edit prices</DialogTitle>
            <DialogDescription className="sr-only">
              Set the item-wide minimum sell price for store and shop stock.
            </DialogDescription>
          </DialogHeader>
          <PriceEditor
            prices={prices}
            onSaved={() => {
              setPriceDialogOpen(false)
              void router.invalidate()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={commercialDialogOpen}
        onOpenChange={setCommercialDialogOpen}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Edit item commercial profile</DialogTitle>
          </DialogHeader>
          <CommercialEditor
            item={product}
            onSaved={() => {
              setCommercialDialogOpen(false)
              void router.invalidate()
            }}
          />
        </DialogContent>
      </Dialog>

      {canSeeActivity && (
        <AuditActivityPanel
          articleNumber={product.articleNumbers[0]?.articleNumber ?? ''}
        />
      )}
    </div>
  )
}

function CommercialEditor({
  item,
  onSaved,
}: {
  item: {
    id: string
    supplier?: { id: string; name: string } | null
    costPrice?: string | null
    costCurrency?: string | null
    minimumSellPriceUgx: string
  }
  onSaved: () => void
}) {
  const [suppliers, setSuppliers] = useState<
    Array<{ id: string; name: string }>
  >([])
  const [supplierId, setSupplierId] = useState(item.supplier?.id ?? '')
  const [costPrice, setCostPrice] = useState(item.costPrice ?? '')
  const [costCurrency, setCostCurrency] = useState(item.costCurrency ?? 'RMB')
  const [minimumSellPriceUgx, setMinimumSellPriceUgx] = useState(
    item.minimumSellPriceUgx,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    void listSuppliersForSelect().then(setSuppliers)
  }, [])
  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateItemCommercialProfile({
        data: {
          itemId: item.id,
          supplierId,
          costPrice,
          costCurrency: costCurrency as 'RMB' | 'USD' | 'UGX',
          minimumSellPriceUgx,
        },
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save item pricing')
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-4">
      <Combobox
        options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        value={supplierId}
        onChange={setSupplierId}
        placeholder="Select supplier"
        searchPlaceholder="Search suppliers…"
        emptyMessage="No suppliers found."
      />
      <MoneyInput
        value={costPrice}
        onChange={setCostPrice}
        currency={costCurrency}
        decimals={costCurrency === 'UGX' ? 0 : 2}
      />
      <select
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        value={costCurrency}
        onChange={(e) => setCostCurrency(e.target.value)}
      >
        <option>RMB</option>
        <option>USD</option>
        <option>UGX</option>
      </select>
      <MoneyInput
        value={minimumSellPriceUgx}
        onChange={setMinimumSellPriceUgx}
        currency="UGX"
        decimals={0}
        roundTo={50}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        className="w-full"
        onClick={() => void save()}
        disabled={saving || !supplierId || !costPrice}
      >
        {saving ? 'Saving…' : 'Save item pricing'}
      </Button>
    </div>
  )
}

type StockPrices = {
  item: { id: string; minimumSellPriceUgx: string } | null
  store: Array<{
    id: string
    quantityOnHand: number
    minimumSellPriceUgx: string
    store: { name: string }
    supplyRouteLine: {
      articleNumberSnapshot: string | null
      itemNameSnapshot: string | null
      designSnapshot: string | null
      colorNameSnapshot: string | null
      colorTextSnapshot: string | null
      sizeTextSnapshot: string | null
    } | null
    variant: {
      size: string
      color: { colorName: string; colorHex: string }
    } | null
  }>
  shop: Array<{
    id: string
    quantityOnHand: number
    minimumSellPriceUgx: string
    shop: { name: string }
    supplyRouteLine: {
      articleNumberSnapshot: string | null
      itemNameSnapshot: string | null
      designSnapshot: string | null
      colorNameSnapshot: string | null
      colorTextSnapshot: string | null
      sizeTextSnapshot: string | null
    } | null
    variant: {
      size: string
      color: { colorName: string; colorHex: string }
    } | null
  }>
}

function PriceSummary({ prices }: { prices: StockPrices }) {
  const rows = [
    ...prices.store.map((s) => ({
      key: `store-${s.id}`,
      location: `Store · ${s.store.name}`,
      color: s.variant?.color ?? null,
      size: s.variant?.size ?? null,
      snapshot: s.supplyRouteLine,
      qty: s.quantityOnHand,
      price: s.minimumSellPriceUgx,
    })),
    ...prices.shop.map((s) => ({
      key: `shop-${s.id}`,
      location: `Shop · ${s.shop.name}`,
      color: s.variant?.color ?? null,
      size: s.variant?.size ?? null,
      snapshot: s.supplyRouteLine,
      qty: s.quantityOnHand,
      price: s.minimumSellPriceUgx,
    })),
  ]
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No stock on hand yet, so no prices to display.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2 font-medium">Location</th>
            <th className="p-2 font-medium">Colour · Size</th>
            <th className="p-2 text-right font-medium">Qty</th>
            <th className="p-2 text-right font-medium">Min sell (UGX)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="p-2">{r.location}</td>
              <td className="p-2">
                {r.color && r.size ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-3 rounded-full border"
                      style={{ backgroundColor: r.color.colorHex }}
                      aria-hidden
                    />
                    {r.color.colorName} · {r.size}
                  </span>
                ) : r.snapshot?.colorNameSnapshot ||
                  r.snapshot?.sizeTextSnapshot ? (
                  <span>
                    {[r.snapshot.colorNameSnapshot, r.snapshot.sizeTextSnapshot]
                      .filter(Boolean)
                      .join(' · ')}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (not fully specified)
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">{r.qty}</td>
              <td className="p-2 text-right font-mono">{r.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PriceEditor({
  prices,
  onSaved,
}: {
  prices: StockPrices
  onSaved: () => void
}) {
  // Item defaults are edited here; stock rows display their immutable
  // snapshots in PriceSummary above.
  type DraftRow = {
    key: 'item'
    itemId: string
    location: string
    original: string
    value: string
    qty: number
  }

  const totalQty =
    prices.store.reduce((s, r) => s + r.quantityOnHand, 0) +
    prices.shop.reduce((s, r) => s + r.quantityOnHand, 0)
  const itemFloor = prices.item?.minimumSellPriceUgx ?? '0'
  const itemId = prices.item?.id

  const [rows, setRows] = useState<DraftRow[]>(() => {
    if (!itemId) return []
    return [
      {
        key: 'item',
        itemId,
        location: 'Current item default (future stock)',
        original: itemFloor,
        value: itemFloor,
        qty: totalQty,
      },
    ]
  })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = rows.filter((r) => r.value !== r.original)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No stock on hand yet, so there are no prices to edit. Prices are set
        when stock first enters a location.
      </p>
    )
  }

  async function save() {
    setPending(true)
    setError(null)
    try {
      for (const r of dirty) {
        await setItemMinimumSellPrice({
          data: { itemId: r.itemId, minimumSellPriceUgx: r.value },
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Location</th>
              <th className="p-2 font-medium">Color · Size</th>
              <th className="p-2 text-right font-medium">Qty</th>
              <th className="p-2 text-right font-medium">Min sell (UGX)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.key} className="border-t align-top">
                <td className="p-2">{r.location}</td>
                <td className="p-2">
                  <span className="text-xs text-muted-foreground">
                    all colors · all sizes
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums">{r.qty}</td>
                <td className="p-2 w-44">
                  <MoneyInput
                    currency="UGX"
                    decimals={0}
                    roundTo={50}
                    value={r.value}
                    onChange={(v) =>
                      setRows((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, value: v } : p,
                        ),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {dirty.length > 0 ? (
            <Badge variant="outline">{dirty.length} pending</Badge>
          ) : (
            'No changes'
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button
            onClick={() => {
              void save()
            }}
            disabled={pending || dirty.length === 0}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface VariantsSectionProps {
  itemId: string
  colors: Array<{
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
  }>
  variants: Array<{ id: string; colorId: string; size: string }>
  stockCounts: Array<{ variantId: string; qty: number; locations: number }>
  prices: StockPrices
  canManage: boolean
  onChanged: () => void
}

/**
 * Variants subsection on the item detail page (issue #7 acceptance #1
 * + #3). Lists each materialised (color × size) variant with an
 * "in stock at N locations" badge. Managers can create new variants
 * or remove unused ones; deleting a variant referenced by stock or
 * sales bubbles up the friendly FK-restrict error from `deleteVariant`.
 */
function VariantsSection({
  itemId,
  colors,
  variants,
  stockCounts,
  prices,
  canManage,
  onChanged,
}: VariantsSectionProps) {
  const [newColorId, setNewColorId] = useState<string>(colors[0]?.id ?? '')
  const [newSize, setNewSize] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const stockByVariant = new Map(stockCounts.map((c) => [c.variantId, c]))
  const unresolvedStock = [
    ...prices.store.map((stock) => ({
      location: `Store · ${stock.store.name}`,
      quantity: stock.quantityOnHand,
      variant: stock.variant,
      source: stock.supplyRouteLine,
    })),
    ...prices.shop.map((stock) => ({
      location: `Shop · ${stock.shop.name}`,
      quantity: stock.quantityOnHand,
      variant: stock.variant,
      source: stock.supplyRouteLine,
    })),
  ].filter((stock) => stock.quantity > 0 && !stock.variant)

  const sorted = [...variants].sort((a, b) => {
    const ac = colors.find((c) => c.id === a.colorId)?.colorName ?? ''
    const bc = colors.find((c) => c.id === b.colorId)?.colorName ?? ''
    return ac === bc ? a.size.localeCompare(b.size) : ac.localeCompare(bc)
  })

  const groups: Array<{
    color: (typeof colors)[number] | undefined
    colorId: string
    variants: typeof sorted
    totalQty: number
    maxLocations: number
  }> = []
  for (const v of sorted) {
    let group = groups.find((g) => g.colorId === v.colorId)
    if (!group) {
      group = {
        color: colors.find((c) => c.id === v.colorId),
        colorId: v.colorId,
        variants: [],
        totalQty: 0,
        maxLocations: 0,
      }
      groups.push(group)
    }
    group.variants.push(v)
    const stock = stockByVariant.get(v.id)
    if (stock) {
      group.totalQty += stock.qty
      group.maxLocations = Math.max(group.maxLocations, stock.locations)
    }
  }

  function toggleGroup(colorId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(colorId)) next.delete(colorId)
      else next.add(colorId)
      return next
    })
  }

  async function addVariant() {
    if (!newColorId || !newSize.trim()) return
    setPending(true)
    setError(null)
    try {
      await createVariant({
        data: { itemId, colorId: newColorId, size: newSize.trim() },
      })
      setNewSize('')
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add variant')
    } finally {
      setPending(false)
    }
  }

  async function removeVariant(variantId: string) {
    if (!confirm('Remove this variant?')) return
    setPending(true)
    setError(null)
    try {
      await deleteVariant({ data: { variantId } })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete variant')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-3" data-cy="variants-section">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Variants</h2>
        <InfoPopover term="variant.barcode" />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No variants yet. Add a color and a size to start tracking stock for
          this item.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Color</th>
                <th className="p-2 font-medium">Size</th>
                <th className="p-2 font-medium">Stock</th>
                {canManage && <th className="p-2 w-10" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expanded.has(g.colorId)
                const colCount = canManage ? 4 : 3
                return (
                  <Fragment key={g.colorId}>
                    <tr
                      className="border-t bg-muted/20 hover:bg-muted/40 cursor-pointer"
                      data-cy="variant-group"
                      data-color-id={g.colorId}
                      data-expanded={isOpen ? 'true' : 'false'}
                    >
                      <td colSpan={colCount} className="p-0">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.colorId)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${g.color?.colorName ?? 'color'} variants`}
                          className="grid w-full items-center gap-2 p-2 text-left"
                          style={{
                            gridTemplateColumns: canManage
                              ? '1fr 1fr 1fr 2.5rem'
                              : '1fr 1fr 1fr',
                          }}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight
                              className={`size-4 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              aria-hidden
                            />
                            <span
                              className="inline-block size-3 rounded-full border"
                              style={{
                                backgroundColor: g.color?.colorHex ?? '#888',
                              }}
                              aria-hidden
                            />
                            <span className="font-medium">
                              {g.color?.colorName ?? '—'}
                            </span>
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {g.variants.length} size
                            {g.variants.length === 1 ? '' : 's'}
                          </span>
                          <span>
                            {g.totalQty > 0 ? (
                              <Badge variant="secondary">
                                {g.totalQty} in stock at {g.maxLocations}{' '}
                                location{g.maxLocations === 1 ? '' : 's'}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                no stock
                              </span>
                            )}
                          </span>
                          {canManage && <span aria-hidden />}
                        </button>
                      </td>
                    </tr>
                    {g.variants.map((v) => {
                      const stock = stockByVariant.get(v.id)
                      return (
                        <tr
                          key={v.id}
                          className="border-t"
                          data-cy="variant-row"
                          hidden={!isOpen}
                        >
                          <td className="p-2 pl-8">
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <span
                                className="inline-block size-3 rounded-full border"
                                style={{
                                  backgroundColor: g.color?.colorHex ?? '#888',
                                }}
                                aria-hidden
                              />
                              {g.color?.colorName ?? '—'}
                            </span>
                          </td>
                          <td className="p-2 font-medium">{v.size}</td>
                          <td className="p-2">
                            {stock && stock.qty > 0 ? (
                              <Badge variant="secondary">
                                {stock.qty} in stock at {stock.locations}{' '}
                                location{stock.locations === 1 ? '' : 's'}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                no stock
                              </span>
                            )}
                          </td>
                          {canManage && (
                            <td className="p-2 text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`Remove variant ${g.color?.colorName ?? ''} ${v.size}`}
                                disabled={pending}
                                onClick={() => {
                                  void removeVariant(v.id)
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {unresolvedStock.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-medium">Unspecified stock</p>
          <p className="mt-1 text-muted-foreground">
            Some stock is recorded for this item without a fully resolved colour
            × size variant. It is included in inventory totals until it is
            specified.
          </p>
          <ul className="mt-2 space-y-1">
            {unresolvedStock.map((stock) => (
              <li key={stock.location} className="flex justify-between gap-3">
                <span>{stock.location}</span>
                <span className="font-mono">
                  {stock.quantity.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && colors.length > 0 && (
        <div
          className="flex flex-wrap items-end gap-2"
          data-cy="add-variant-form"
        >
          <div className="space-y-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="new-variant-color"
            >
              Color
            </label>
            <select
              id="new-variant-color"
              value={newColorId}
              onChange={(e) => setNewColorId(e.target.value)}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              {colors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.colorName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              className="text-xs text-muted-foreground"
              htmlFor="new-variant-size"
            >
              Size
            </label>
            <Input
              id="new-variant-size"
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              placeholder="e.g. M"
              className="h-10 w-32"
            />
          </div>
          <Button
            type="button"
            onClick={() => {
              void addVariant()
            }}
            disabled={!newColorId || !newSize.trim() || pending}
            data-cy="add-variant-submit"
          >
            <Plus className="mr-1 size-4" /> Add variant
          </Button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" data-cy="variants-error">
          {error}
        </p>
      )}
    </section>
  )
}
