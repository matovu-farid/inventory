import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Plus, Pencil } from "lucide-react"
import { requireUiPermission, useCan } from "#/lib/permissions"
import { getProductByArticle } from "#/server/functions/products/products"
import {
  listProductStockPrices,
  setStockMinimumPrice,
} from "#/server/functions/products/prices"
import { ColorEditor } from "#/components/products/color-editor"
import { PhotoHandoffQR } from "#/components/products/photo-handoff-qr"
import { productImageUrl } from "#/lib/products"
import { Button } from "#/components/ui/button"
import { MoneyInput } from "#/components/ui/money-input"
import { Badge } from "#/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"

export const Route = createFileRoute("/products/$articleNumber")({
  beforeLoad: ({ context }) => requireUiPermission(context, "products.view"),
  loader: async ({ params }) => {
    const product = await getProductByArticle({
      data: { articleNumber: params.articleNumber },
    })
    if (!product) throw new Error(`Product not found: ${params.articleNumber}`)
    const prices = await listProductStockPrices({ data: { productId: product.id } })
    return { product, prices }
  },
  component: ProductDetailPage,
})

function ProductDetailPage() {
  const { product, prices } = Route.useLoaderData()
  const router = useRouter()
  const canManage = useCan("products.manage")
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [activeColorId, setActiveColorId] = useState<string | undefined>(
    product.colors[0]?.id,
  )
  const active =
    product.colors.find((c) => c.id === activeColorId) ?? product.colors[0]

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-sm text-muted-foreground">
          {product.articleNumber}
        </p>
        <h1 className="text-2xl font-bold">{product.name}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="aspect-square rounded border bg-muted flex items-center justify-center overflow-hidden">
            {active?.imageS3Key ? (
              <img
                src={productImageUrl(active.imageS3Key)!}
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
          {canManage && active && (
            <div className="pt-3 border-t mt-3">
              <PhotoHandoffQR
                productColorId={active.id}
                onUploaded={() => router.invalidate()}
              />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-medium">Sizes</h2>
            <p className="text-sm">{product.sizes.join(", ") || "—"}</p>
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
            productId={product.id}
            onCreated={() => {
              setColorDialogOpen(false)
              router.invalidate()
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
              router.invalidate()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

type StockPrices = {
  store: Array<{
    id: string
    size: string
    quantityOnHand: number
    minimumSellPriceUgx: string
    store: { name: string }
    productColor: { colorName: string; colorHex: string }
  }>
  shop: Array<{
    id: string
    size: string
    quantityOnHand: number
    minimumSellPriceUgx: string
    shop: { name: string }
    productColor: { colorName: string; colorHex: string }
  }>
}

function PriceSummary({ prices }: { prices: StockPrices }) {
  const rows = [
    ...prices.store.map((s) => ({
      key: `store-${s.id}`,
      location: `Store · ${s.store.name}`,
      color: s.productColor,
      size: s.size,
      qty: s.quantityOnHand,
      price: s.minimumSellPriceUgx,
    })),
    ...prices.shop.map((s) => ({
      key: `shop-${s.id}`,
      location: `Shop · ${s.shop.name}`,
      color: s.productColor,
      size: s.size,
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
      color: s.productColor,
      size: s.size,
      qty: s.quantityOnHand,
      original: s.minimumSellPriceUgx,
      value: s.minimumSellPriceUgx,
    })),
    ...prices.shop.map((s) => ({
      key: `shop-${s.id}`,
      stockType: "shop" as const,
      stockId: s.id,
      location: `Shop · ${s.shop.name}`,
      color: s.productColor,
      size: s.size,
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
          <Button onClick={save} disabled={pending || dirty.length === 0}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
