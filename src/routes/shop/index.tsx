import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { roundUgxFloor50, formatUgx, formatUgxTotal } from "#/lib/format"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { getShopPrereqs } from "#/server/functions/prereqs/shop"
import { SATISFIED } from "#/lib/prerequisites/types"
import type { PrerequisiteResult } from "#/lib/prerequisites/types"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Separator } from "#/components/ui/separator"
import { InfoTip } from "#/components/ui/info-tip"
import { ArrowLeft, Check, Plus, ShoppingCart, PackageCheck } from "lucide-react"
import { AddShopDialog } from "#/components/shops/add-shop-dialog"
import { ReceiveTransferForm } from "#/components/transfers/receive-transfer-form"
import { listShops } from "#/server/functions/admin/locations"
import { getShopStock, recordSale } from "#/server/functions/shop/sales"
import { listTransfers } from "#/server/functions/store/transfers"
import { getSession } from "#/server/middleware/auth"

const searchSchema = z.object({
  shopId: z.string().uuid().optional(),
})

export const Route = createFileRoute("/shop/")({
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
  const [stock, setStock] = useState<
    Array<{
      id: string
      productName: string
      articleNumber: string | null
      quantityOnHand: number
      costPerUnitUgx: string
      minimumSellPriceUgx: string
    }>
  >([])
  const [saleOpen, setSaleOpen] = useState(false)
  const [prerequisites, setPrerequisites] = useState<PrerequisiteResult>(SATISFIED)

  async function loadStock(id: string) {
    setShopId(id)
    if (!id) { setStock([]); return }
    const s = await getShopStock({ data: { shopId: id } })
    setStock(s)
  }

  useEffect(() => {
    if (shops.length === 0) {
      if (shopId) setShopId("")
      return
    }
    if (!shops.some((s) => s.id === shopId)) {
      setShopId(shops[0].id)
    }
  }, [shops])

  useEffect(() => {
    if (shopId && shops.length > 0) loadStock(shopId)
  }, [shopId])

  useEffect(() => {
    let cancelled = false
    getShopPrereqs({ data: { shopId: shopId || null } }).then((r) => {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shop</h1>
        <p className="text-muted-foreground">
          View shop inventory and record sales.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={shopId} onValueChange={loadStock}>
          <SelectTrigger className="w-48">
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
        {canManage && (
          <AddShopDialog onCreated={() => router.invalidate()} />
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
              <Button>
                <ShoppingCart className="mr-2 h-4 w-4" />
                New Sale
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Record Sale</DialogTitle>
              </DialogHeader>
              <NewSaleForm
                shopId={shopId}
                stock={stock.filter((s) => s.quantityOnHand > 0)}
                onSuccess={() => {
                  setSaleOpen(false)
                  loadStock(shopId)
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
            {canManage ? " Use the Add Shop button above to create one." : ""}
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
                          router.invalidate()
                          loadStock(shopId)
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}

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

            {stock.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                No stock at this shop. Transfer goods from the store.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>
                        <span className="inline-flex items-center gap-1.5">
                          Art # <InfoTip term="col.articleNumber" />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="inline-flex items-center gap-1.5">
                          Qty <InfoTip term="col.qtyOnHand" />
                        </span>
                      </TableHead>
                      <TableHead className="text-right">Cost/Unit (UGX)</TableHead>
                      <TableHead className="text-right">Min Sell (UGX)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stock.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">
                          {s.productName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.articleNumber || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.quantityOnHand === 0 ? (
                            <Badge variant="outline">Out</Badge>
                          ) : (
                            s.quantityOnHand
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {roundUgxFloor50(s.costPerUnitUgx).toFormat(0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {roundUgxFloor50(s.minimumSellPriceUgx).toFormat(0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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

type StockItem = {
  id: string
  productName: string
  articleNumber?: string | null
  quantityOnHand: number
  minimumSellPriceUgx: string
}

function NewSaleForm({
  shopId,
  stock,
  onSuccess,
}: {
  shopId: string
  stock: StockItem[]
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
          <CommandInput placeholder="Search by product or article #..." />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No matching products.</CommandEmpty>
            {stock.map((s) => {
              const isSelected = selectedIds.has(s.id)
              return (
                <CommandItem
                  key={s.id}
                  value={`${s.productName} ${s.articleNumber ?? ""}`}
                  onSelect={() => toggleSelection(s.id)}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                    <span className="truncate font-medium">{s.productName}</span>
                    {s.articleNumber && (
                      <span className="truncate text-xs text-muted-foreground">
                        {s.articleNumber}
                      </span>
                    )}
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

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {cart.length} item{cart.length === 1 ? "" : "s"} selected
          </p>
          <Button
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
        className="-ml-2 h-8 text-muted-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to selection
      </Button>

      {cart.length > 0 && (
        <div className="space-y-2">
          {cart.map((item) => {
            const s = stock.find((x) => x.id === item.stockId)
            if (!s) return null
            const isBelowMin =
              item.price !== "" &&
              new BigNumber(item.price || 0).lt(s.minimumSellPriceUgx)
            return (
              <div
                key={item.stockId}
                className="space-y-1 p-3 border rounded-lg"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">
                    {s.productName}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFromCart(item.stockId)}
                  >
                    x
                  </Button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-20 space-y-1">
                    <Label className="text-xs text-muted-foreground">Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      max={s.quantityOnHand}
                      className="text-right"
                      value={item.qty}
                      onChange={(e) =>
                        updateCart(item.stockId, "qty", e.target.value)
                      }
                    />
                  </div>
                  <span className="pb-2 text-muted-foreground">x</span>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Price (min: {formatUgx(s.minimumSellPriceUgx)})
                    </Label>
                    <MoneyInput
                      currency="UGX"
                      roundTo={50}
                      value={item.price}
                      onChange={(val) =>
                        updateCart(item.stockId, "price", val)
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                {isBelowMin && (
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs text-muted-foreground">
                      Reason for selling below{" "}
                      {formatUgx(s.minimumSellPriceUgx)}
                    </Label>
                    <Input
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

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Label>Payment</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as "cash" | "bank")}
          >
            <SelectTrigger className="w-32">
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
          <p className="text-xl font-bold font-mono">
            {formatUgxTotal(total)}
          </p>
        </div>
      </div>

      {errors.cart && (
        <p className="text-sm text-destructive text-center">{errors.cart}</p>
      )}

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={pending || cart.length === 0}
      >
        {pending ? "Recording..." : "Record Sale"}
      </Button>
    </div>
  )
}
