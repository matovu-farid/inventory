import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { requireUiPermission, useCan } from "#/lib/permissions"
import {
  getItemByArticle,
  listItemCategories,
} from "#/server/functions/items/items"
import {
  listItemStockPrices,
  setStockMinimumPrice,
} from "#/server/functions/items/prices"
import { countVariantStockLocations } from "#/server/functions/items/variant-stock-counts"
import {
  createVariant,
  deleteVariant,
} from "#/server/functions/items/variants"
import { ColorEditor } from "#/components/items/color-editor"
import { CategoryEditPopover } from "#/components/items/category-edit-popover"
import { PhotoHandoffQR } from "#/components/items/photo-handoff-qr"
import { AuditActivityPanel } from "#/components/audit/audit-activity-panel"
import { itemImageUrl } from "#/lib/items"
import { deriveSizes } from "#/lib/variants"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { Badge } from "#/components/ui/badge"
import { InfoTip } from "#/components/ui/info-tip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"

export const Route = createFileRoute("/items/$articleNumber")({
  beforeLoad: ({ context }) => requireUiPermission(context, "items.view"),
  loader: async ({ params }) => {
    const product = await getItemByArticle({
      data: { articleNumber: params.articleNumber },
    })
    if (!product) throw new Error(`Product not found: ${params.articleNumber}`)
    const [prices, variantStockCounts, categories] = await Promise.all([
      listItemStockPrices({ data: { itemId: product.id } }),
      countVariantStockLocations({ data: { itemId: product.id } }),
      listItemCategories(),
    ])
    return { product, prices, variantStockCounts, categories }
  },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { product, prices, variantStockCounts, categories } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan("items.manage")
  const canSeeActivity = useCan("audit.viewArticleActivity")
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [activeColorId, setActiveColorId] = useState<string | undefined>(
    product.colors[0]?.id,
  )
  const active =
    product.colors.find((c) => c.id === activeColorId) ?? product.colors[0]
  const sizes = deriveSizes(product.variants)

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-sm text-muted-foreground">
          {product.articleNumber}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <CategoryEditPopover
            itemId={product.id}
            articleNumber={product.articleNumber}
            name={product.name}
            current={product.category}
            categories={categories}
            canEdit={canManage}
            onSaved={() => void router.invalidate()}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="aspect-square rounded border bg-muted flex items-center justify-center overflow-hidden">
            {active.imageS3Key ? (
              <img
                src={itemImageUrl(active.imageS3Key)}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span className="text-sm text-muted-foreground">no image</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {product.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveColorId(c.id)}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs hover:bg-muted"
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
          {canManage && (
            <div className="pt-3 border-t mt-3">
              <PhotoHandoffQR
                itemColorId={active.id}
                onUploaded={() => { void router.invalidate() }}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Sizes</h2>
            <p className="text-sm">{sizes.join(", ") || "—"}</p>
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
        canManage={canManage}
        onChanged={() => {
          void router.invalidate()
        }}
      />

      {canManage && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Prices</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPriceDialogOpen(true)}
            >
              <Pencil className="mr-1 size-3" /> Edit prices
            </Button>
          </div>
          <PriceSummary prices={prices} />
        </section>
      )}

      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add color</DialogTitle>
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

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit prices</DialogTitle>
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

      {canSeeActivity && <AuditActivityPanel articleNumber={product.articleNumber} />}
    </div>
  )
}

type StockPrices = {
  // Stock now references variant_id (issue #4); color + size live on the
  // joined variant. The shape here mirrors the `listItemStockPrices`
  // server-fn return type.
  store: Array<{
    id: string
    quantityOnHand: number
    minimumSellPriceUgx: string
    store: { name: string }
    variant: {
      size: string
      color: { colorName: string; colorHex: string }
    }
  }>
  shop: Array<{
    id: string
    quantityOnHand: number
    minimumSellPriceUgx: string
    shop: { name: string }
    variant: {
      size: string
      color: { colorName: string; colorHex: string }
    }
  }>
}

function PriceSummary({ prices }: { prices: StockPrices }) {
  const rows = [
    ...prices.store.map((s) => ({
      key: `store-${s.id}`,
      location: `Store · ${s.store.name}`,
      color: s.variant.color,
      size: s.variant.size,
      qty: s.quantityOnHand,
      price: s.minimumSellPriceUgx,
    })),
    ...prices.shop.map((s) => ({
      key: `shop-${s.id}`,
      location: `Shop · ${s.shop.name}`,
      color: s.variant.color,
      size: s.variant.size,
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
            <th className="p-2 font-medium">Color · Size</th>
            <th className="p-2 text-right font-medium">Qty</th>
            <th className="p-2 text-right font-medium">Min sell (UGX)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <td className="p-2">{r.location}</td>
              <td className="p-2">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: r.color.colorHex }}
                    aria-hidden
                  />
                  {r.color.colorName} · {r.size}
                </span>
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
  type DraftRow = {
    key: string
    stockType: "store" | "shop"
    stockId: string
    location: string
    color: { colorName: string; colorHex: string }
    size: string
    qty: number
    original: string
    value: string
  }
  const [rows, setRows] = useState<DraftRow[]>(() => [
    ...prices.store.map((s) => ({
      key: `store-${s.id}`,
      stockType: "store" as const,
      stockId: s.id,
      location: `Store · ${s.store.name}`,
      color: s.variant.color,
      size: s.variant.size,
      qty: s.quantityOnHand,
      original: s.minimumSellPriceUgx,
      value: s.minimumSellPriceUgx,
    })),
    ...prices.shop.map((s) => ({
      key: `shop-${s.id}`,
      stockType: "shop" as const,
      stockId: s.id,
      location: `Shop · ${s.shop.name}`,
      color: s.variant.color,
      size: s.variant.size,
      qty: s.quantityOnHand,
      original: s.minimumSellPriceUgx,
      value: s.minimumSellPriceUgx,
    })),
  ])
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
        await setStockMinimumPrice({
          data: {
            stockType: r.stockType,
            stockId: r.stockId,
            minimumSellPriceUgx: r.value,
          },
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
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
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block size-3 rounded-full border"
                      style={{ backgroundColor: r.color.colorHex }}
                      aria-hidden
                    />
                    {r.color.colorName} · {r.size}
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
            "No changes"
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button onClick={() => { void save() }} disabled={pending || dirty.length === 0}>
            {pending ? "Saving…" : "Save changes"}
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
  canManage,
  onChanged,
}: VariantsSectionProps) {
  const [newColorId, setNewColorId] = useState<string>(colors[0]?.id ?? "")
  const [newSize, setNewSize] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stockByVariant = new Map(
    stockCounts.map((c) => [c.variantId, c]),
  )

  const sorted = [...variants].sort((a, b) => {
    const ac = colors.find((c) => c.id === a.colorId)?.colorName ?? ""
    const bc = colors.find((c) => c.id === b.colorId)?.colorName ?? ""
    return ac === bc ? a.size.localeCompare(b.size) : ac.localeCompare(bc)
  })

  async function addVariant() {
    if (!newColorId || !newSize.trim()) return
    setPending(true)
    setError(null)
    try {
      await createVariant({
        data: { itemId, colorId: newColorId, size: newSize.trim() },
      })
      setNewSize("")
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add variant")
    } finally {
      setPending(false)
    }
  }

  async function removeVariant(variantId: string) {
    if (!confirm("Remove this variant?")) return
    setPending(true)
    setError(null)
    try {
      await deleteVariant({ data: { variantId } })
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete variant")
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="space-y-3" data-cy="variants-section">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Variants</h2>
        <InfoTip term="variant.barcode" />
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No variants yet. Add a color and a size to start tracking stock
          for this item.
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
              {sorted.map((v) => {
                const color = colors.find((c) => c.id === v.colorId)
                const stock = stockByVariant.get(v.id)
                return (
                  <tr key={v.id} className="border-t" data-cy="variant-row">
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block size-3 rounded-full border"
                          style={{ backgroundColor: color?.colorHex ?? "#888" }}
                          aria-hidden
                        />
                        {color?.colorName ?? "—"}
                      </span>
                    </td>
                    <td className="p-2 font-medium">{v.size}</td>
                    <td className="p-2">
                      {stock && stock.qty > 0 ? (
                        <Badge variant="secondary">
                          {stock.qty} in stock at {stock.locations}{" "}
                          location{stock.locations === 1 ? "" : "s"}
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
                          aria-label={`Remove variant ${color?.colorName ?? ""} ${v.size}`}
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
            </tbody>
          </table>
        </div>
      )}

      {canManage && colors.length > 0 && (
        <div
          className="flex flex-wrap items-end gap-2"
          data-cy="add-variant-form"
        >
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="new-variant-color">
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
            <label className="text-xs text-muted-foreground" htmlFor="new-variant-size">
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
