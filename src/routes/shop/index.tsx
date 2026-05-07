import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import BigNumber from "bignumber.js"
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
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Separator } from "#/components/ui/separator"
import { InfoTip } from "#/components/ui/info-tip"
import { Plus, ShoppingCart } from "lucide-react"
import { AddShopDialog } from "#/components/shops/add-shop-dialog"
import { listShops } from "#/server/functions/admin/locations"
import { getShopStock, recordSale } from "#/server/functions/shop/sales"
import { getSession } from "#/server/middleware/auth"

export const Route = createFileRoute("/shop/")({
  loader: async () => {
    const session = await getSession()
    const role = (session?.user as { role?: string } | undefined)?.role ?? null
    const shops = await listShops()
    return { shops, role }
  },
  component: ShopPage,
})

function ShopPage() {
  const { shops, role } = Route.useLoaderData()
  const router = useRouter()
  const canManage = role === "admin" || role === "supervisor"
  const [shopId, setShopId] = useState(shops[0]?.id ?? "")
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
                    {totalValue.toFormat(0)}
                  </div>
                  <p className="text-xs text-muted-foreground">UGX</p>
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
                      <TableHead className="text-right">Cost/Unit</TableHead>
                      <TableHead className="text-right">Min Sell</TableHead>
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
                          {new BigNumber(s.costPerUnitUgx).toFormat(0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {new BigNumber(s.minimumSellPriceUgx).toFormat(0)}
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

function NewSaleForm({
  shopId,
  stock,
  onSuccess,
}: {
  shopId: string
  stock: Array<{
    id: string
    productName: string
    quantityOnHand: number
    minimumSellPriceUgx: string
  }>
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [cart, setCart] = useState<
    Array<{ stockId: string; qty: number; price: string }>
  >([])
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash")
  const [errors, setErrors] = useState<Record<string, string>>({})

  function addToCart(stockId: string) {
    const item = stock.find((s) => s.id === stockId)
    if (!item) return
    if (cart.find((c) => c.stockId === stockId)) return
    setCart((c) => [
      ...c,
      {
        stockId,
        qty: 1,
        price: item.minimumSellPriceUgx,
      },
    ])
  }

  function updateCart(stockId: string, field: "qty" | "price", value: string) {
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Add Item</Label>
        <Select onValueChange={addToCart}>
          <SelectTrigger>
            <SelectValue placeholder="Select product..." />
          </SelectTrigger>
          <SelectContent>
            {stock
              .filter((s) => !cart.find((c) => c.stockId === s.id))
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.productName} (avail: {s.quantityOnHand})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

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
                      Price (min:{" "}
                      {new BigNumber(s.minimumSellPriceUgx).toFormat(0)})
                    </Label>
                    <MoneyInput
                      currency="UGX"
                      value={item.price}
                      onChange={(val) =>
                        updateCart(item.stockId, "price", val)
                      }
                      placeholder="0"
                      error={
                        isBelowMin
                          ? `Below minimum (${new BigNumber(s.minimumSellPriceUgx).toFormat(0)})`
                          : undefined
                      }
                    />
                  </div>
                </div>
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
            UGX {total.toFormat(0)}
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
