import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useEffect, useCallback } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { formatUgx, formatUgxTotal } from "#/lib/format"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { getShopPrereqs } from "#/server/functions/prereqs/shop"
import { SATISFIED } from "#/lib/prerequisites/types"
import type { PrerequisiteResult } from "#/lib/prerequisites/types"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "#/components/ui/responsive-dialog"
import { DialogTrigger } from "#/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { InfoTip } from "#/components/ui/info-tip"
import {
  ArrowLeft,
  Check,
  Minus,
  Plus,
  ShoppingCart,
  PackageCheck,
  Trash2,
} from "lucide-react"
import { ItemCard } from "#/components/items/item-card"
import { aggregateStockByArticle } from "#/lib/items"
import { AddShopDialog } from "#/components/shops/add-shop-dialog"
import { ReceiveTransferForm } from "#/components/transfers/receive-transfer-form"
import { listShops } from "#/server/functions/admin/locations"
import { getShopStock, recordSale } from "#/server/functions/shop/sales"
import { listTransfers } from "#/server/functions/store/transfers"
import { getSession } from "#/server/middleware/auth"

type ShopStockItem = Awaited<ReturnType<typeof getShopStock>>[number]

const searchSchema = z.object({
  shopId: z.uuid().optional(),
})

export const Route = createFileRoute("/shop/")({
  beforeLoad: ({ context }) => requireUiPermission(context, "shop.view"),
  validateSearch: searchSchema,
  loader: async () => {
    const session = await getSession()
    const role = (session?.user as { role?: string } | undefined)?.role ?? null
    const canManage = role === "admin" || role === "supervisor"
    const [shops, transfers] = await Promise.all([
      listShops(),
      canManage ? listTransfers() : Promise.resolve([]),
    ])
    return { shops, role, transfers }
  },
  component: ShopPage,
})

function ShopPage() {
  const { shops, role, transfers } = Route.useLoaderData()
  const { shopId: shopIdFromSearch } = Route.useSearch()
  const router = useRouter()
  const canManage = role === "admin" || role === "supervisor"
  const [shopId, setShopId] = useState(
    shopIdFromSearch && shops.some((s) => s.id === shopIdFromSearch)
      ? shopIdFromSearch
      : shops[0]?.id ?? "",
  )
  const [receiveOpen, setReceiveOpen] = useState(false)

  const pendingTransfers = transfers.filter(
    (t) => t.status === "dispatched" && t.shopId === shopId,
  )
  const [stock, setStock] = useState<ShopStockItem[]>([])
  const [saleOpen, setSaleOpen] = useState(false)
  const [prerequisites, setPrerequisites] = useState<PrerequisiteResult>(SATISFIED)

  const loadStock = useCallback(async (id: string) => {
    setShopId(id)
    if (!id) { setStock([]); return }
    const s = await getShopStock({ data: { shopId: id } })
    setStock(s)
  }, [])

  const shopsLength = shops.length
  useEffect(() => {
    if (shopsLength === 0) {
      if (shopId) setShopId("")
      return
    }
    if (!shops.some((s) => s.id === shopId)) {
      setShopId(shops[0].id)
    }
  }, [shops, shopId, shopsLength])

  useEffect(() => {
    if (shopId && shopsLength > 0) void loadStock(shopId)
  }, [shopId, shopsLength, loadStock])

  useEffect(() => {
    let cancelled = false
    void getShopPrereqs({ data: { shopId: shopId || null } }).then((r) => {
      if (!cancelled) setPrerequisites(r)
    })
    return () => {
      cancelled = true
    }
  }, [shopId])

  const totalItems = stock.reduce((s, i) => s + i.quantityOnHand, 0)
  const totalValue = stock.reduce(
    (s, i) =>
      s.plus(new BigNumber(i.costPerUnitUgx).times(i.quantityOnHand)),
    new BigNumber(0),
  )
  const aggregated = aggregateStockByArticle(stock)
  const currentShopName =
    shops.find((s) => s.id === shopId)?.name ?? "Shop"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shop</h1>
        <p className="text-muted-foreground">
          View shop inventory and record sales.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={shopId} onValueChange={(v) => { void loadStock(v) }}>
          <SelectTrigger className="h-11 w-48">
            <SelectValue placeholder="Select shop" />
          </SelectTrigger>
          <SelectContent>
            {shops.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {role === "admin" && (
          <AddShopDialog onCreated={() => { void router.invalidate() }} />
        )}
        {canManage &&
          (shopId ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/shop/opening-balance" search={{ shopId }}>
                <Plus className="mr-1 h-4 w-4" />
                Add Existing Stock
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Plus className="mr-1 h-4 w-4" />
              Add Existing Stock
            </Button>
          ))}
        {shopId && (
          <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
            <DialogTrigger asChild>
              <Button className="h-11">
                <ShoppingCart className="mr-2 h-4 w-4" />
                New Sale
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Record Sale</DialogTitle>
              </DialogHeader>
              <NewSaleForm
                shopId={shopId}
                stock={stock.filter((s) => s.quantityOnHand > 0)}
                onSuccess={() => {
                  setSaleOpen(false)
                  void loadStock(shopId)
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <PagePrerequisites result={prerequisites}>
        {shops.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No shops configured yet.
            {role === "admin"
              ? " Use the Add Shop button above to create one."
              : ""}
          </p>
        ) : (
          <>
            {pendingTransfers.length > 0 && canManage && (
              <div className="rounded-md border border-amber-300/60 bg-amber-50/80 p-4 text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <PackageCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                    <div>
                      <p className="text-sm font-medium leading-tight">
                        {pendingTransfers.length} transfer
                        {pendingTransfers.length === 1 ? "" : "s"} awaiting receipt
                      </p>
                      <p className="text-[13px] opacity-90">
                        Goods have been dispatched from the warehouse. Count them
                        and confirm receipt to add them to this shop's stock.
                      </p>
                    </div>
                  </div>
                  <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">Confirm Receipt</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Confirm Transfer Receipt</DialogTitle>
                      </DialogHeader>
                      <ReceiveTransferForm
                        transfers={pendingTransfers}
                        onSuccess={() => {
                          setReceiveOpen(false)
                          void router.invalidate()
                          void loadStock(shopId)
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}

            {role === "admin" && (
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      Items in Stock
                      <InfoTip term="kpi.itemsInStockShop" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalItems}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      Stock Value
                      <InfoTip term="kpi.shopStockValue" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-mono">
                      {formatUgxTotal(totalValue)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {aggregated.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                No stock at this shop. Transfer goods from the store.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm text-muted-foreground">
                    {aggregated.length} product
                    {aggregated.length === 1 ? "" : "s"} ·{" "}
                    {aggregated.reduce((s, a) => s + a.total, 0)} units
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {aggregated.map((a) => (
                    <ItemCard
                      key={a.item.articleNumber}
                      data={{
                        articleNumber: a.item.articleNumber,
                        name: a.item.name,
                        // Per-variant counts via variant_id joins (#4);
                        // ItemCard derives the size grid from these.
                        variants: a.variants,
                        colors: a.colors,
                        totalQuantity: a.total,
                        locationCounts: [
                          { label: currentShopName, qty: a.total },
                        ],
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </PagePrerequisites>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* New Sale Form                                                       */
/* ------------------------------------------------------------------ */

function itemLabel(s: ShopStockItem): string {
  // Stock now references variant_id (issue #4); the joined variant
  // carries color + size — the picker still groups rows as (color × size).
  return `${s.variant.color.item.name} — ${s.variant.color.colorName} / ${s.variant.size}`
}

function NewSaleForm({
  shopId,
  stock,
  onSuccess,
}: {
  shopId: string
  stock: ShopStockItem[]
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [stage, setStage] = useState<"select" | "configure">("select")
  const [cart, setCart] = useState<
    Array<{
      stockId: string
      qty: number
      price: string
      belowMinimumReason: string
    }>
  >([])
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash")
  const [errors, setErrors] = useState<Record<string, string>>({})

  function toggleSelection(stockId: string) {
    const item = stock.find((s) => s.id === stockId)
    if (!item) return
    setCart((c) => {
      const existing = c.find((x) => x.stockId === stockId)
      if (existing) return c.filter((x) => x.stockId !== stockId)
      return [
        ...c,
        {
          stockId,
          qty: 1,
          price: item.minimumSellPriceUgx,
          belowMinimumReason: "",
        },
      ]
    })
  }

  function updateCart(
    stockId: string,
    field: "qty" | "price" | "belowMinimumReason",
    value: string,
  ) {
    setCart((c) =>
      c.map((i) =>
        i.stockId === stockId
          ? { ...i, [field]: field === "qty" ? Number(value) : value }
          : i,
      ),
    )
  }

  function removeFromCart(stockId: string) {
    setCart((c) => c.filter((i) => i.stockId !== stockId))
  }

  const total = cart.reduce(
    (s, i) => s.plus(new BigNumber(i.price || 0).times(i.qty)),
    new BigNumber(0),
  )

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (cart.length === 0) {
      newErrors.cart = "Add at least one item"
    }
    for (const item of cart) {
      if (!item.price || new BigNumber(item.price).lte(0)) {
        newErrors[`price_${item.stockId}`] = "Price is required"
      }
      if (item.qty < 1) {
        newErrors[`qty_${item.stockId}`] = "Quantity must be at least 1"
      }
      const s = stock.find((x) => x.id === item.stockId)
      if (s && item.qty > s.quantityOnHand) {
        newErrors[`qty_${item.stockId}`] = `Only ${s.quantityOnHand} available`
      }
      if (
        s &&
        item.price !== "" &&
        new BigNumber(item.price || 0).lt(s.minimumSellPriceUgx) &&
        item.belowMinimumReason.trim().length === 0
      ) {
        newErrors[`reason_${item.stockId}`] = "Reason required for below-minimum sale"
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setPending(true)
    try {
      await recordSale({
        data: {
          shopId,
          paymentMethod,
          items: cart.map((c) => ({
            shopStockId: c.stockId,
            quantity: c.qty,
            unitPriceUgx: c.price,
            belowMinimumReason: c.belowMinimumReason.trim() || undefined,
          })),
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to record sale:", err)
      alert(err instanceof Error ? err.message : "Sale failed")
    } finally {
      setPending(false)
    }
  }

  if (stage === "select") {
    const selectedIds = new Set(cart.map((c) => c.stockId))
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Search and select one or more products to sell.
        </p>
        <Command className="rounded-md border" shouldFilter={true}>
          <CommandInput
            className="h-12 text-base"
            placeholder="Search by item or article #..."
          />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>No matching items.</CommandEmpty>
            {stock.map((s) => {
              const isSelected = selectedIds.has(s.id)
              const label = itemLabel(s)
              const article = s.variant.color.item.articleNumber
              return (
                <CommandItem
                  key={s.id}
                  value={`${label} ${article}`}
                  onSelect={() => toggleSelection(s.id)}
                  className="flex min-h-12 items-center justify-between gap-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {isSelected && <Check className="size-3.5" />}
                    </span>
                    <span className="truncate font-medium">{label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {article}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs text-muted-foreground">
                    <span>avail {s.quantityOnHand}</span>
                    <span className="font-mono">
                      min {formatUgx(s.minimumSellPriceUgx)}
                    </span>
                  </div>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-between border-t bg-background px-6 py-4">
          <p className="text-sm text-muted-foreground">
            {cart.length} item{cart.length === 1 ? "" : "s"} selected
          </p>
          <Button
            className="h-11"
            onClick={() => setStage("configure")}
            disabled={cart.length === 0}
          >
            Continue
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setStage("select")}
        className="-ml-2 h-9 text-muted-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to selection
      </Button>

      {cart.length > 0 && (
        <div className="space-y-3 pb-4">
          {cart.map((item) => {
            const s = stock.find((x) => x.id === item.stockId)
            if (!s) return null
            const isBelowMin =
              item.price !== "" &&
              new BigNumber(item.price || 0).lt(s.minimumSellPriceUgx)
            const decQty = () =>
              updateCart(
                item.stockId,
                "qty",
                String(Math.max(1, item.qty - 1)),
              )
            const incQty = () =>
              updateCart(
                item.stockId,
                "qty",
                String(Math.min(s.quantityOnHand, item.qty + 1)),
              )
            return (
              <div
                key={item.stockId}
                className="space-y-3 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {itemLabel(s)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFromCart(item.stockId)}
                    aria-label={`Remove ${itemLabel(s)}`}
                  >
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </Button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Qty</Label>
                    <div className="flex items-stretch">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 rounded-r-none"
                        onClick={decQty}
                        disabled={item.qty <= 1}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-4" strokeWidth={1.75} />
                      </Button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={s.quantityOnHand}
                        className="h-11 w-16 rounded-none border-x-0 text-center text-base"
                        value={item.qty}
                        onChange={(e) =>
                          updateCart(item.stockId, "qty", e.target.value)
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-11 rounded-l-none"
                        onClick={incQty}
                        disabled={item.qty >= s.quantityOnHand}
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-4" strokeWidth={1.75} />
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-[10rem] flex-1 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Price (min: {formatUgx(s.minimumSellPriceUgx)})
                    </Label>
                    <MoneyInput
                      currency="UGX"
                      roundTo={50}
                      className="h-11 text-base"
                      value={item.price}
                      onChange={(val) =>
                        updateCart(item.stockId, "price", val)
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                {isBelowMin && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Reason for selling below{" "}
                      {formatUgx(s.minimumSellPriceUgx)}
                    </Label>
                    <Input
                      className="h-11 text-base"
                      value={item.belowMinimumReason}
                      onChange={(e) =>
                        updateCart(
                          item.stockId,
                          "belowMinimumReason",
                          e.target.value,
                        )
                      }
                      placeholder="e.g. damaged, customer haggled, clearance"
                    />
                    {errors[`reason_${item.stockId}`] && (
                      <p className="text-xs text-destructive">
                        {errors[`reason_${item.stockId}`]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky footer — pinned within the scrollable DialogContent */}
      <div className="sticky bottom-0 -mx-6 -mb-6 space-y-3 border-t bg-background px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Label>Payment</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "cash" | "bank")}
            >
              <SelectTrigger className="h-11 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="font-mono text-2xl font-bold">
              {formatUgxTotal(total)}
            </p>
          </div>
        </div>

        {errors.cart && (
          <p className="text-center text-sm text-destructive">{errors.cart}</p>
        )}

        <Button
          className="h-12 w-full text-base"
          onClick={() => { void handleSubmit() }}
          disabled={pending || cart.length === 0}
        >
          {pending ? "Recording..." : "Record Sale"}
        </Button>
      </div>
    </div>
  )
}
