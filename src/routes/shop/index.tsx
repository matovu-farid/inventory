import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
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
import { ShoppingCart } from "lucide-react"
import { listShops } from "#/server/functions/admin/locations"
import { getShopStock, recordSale } from "#/server/functions/shop/sales"

export const Route = createFileRoute("/shop/")({
  loader: async () => {
    const shops = await listShops()
    return { shops }
  },
  component: ShopPage,
})

function ShopPage() {
  const { shops } = Route.useLoaderData()
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

  async function loadStock(id: string) {
    setShopId(id)
    if (!id) { setStock([]); return }
    const s = await getShopStock({ data: { shopId: id } })
    setStock(s)
  }

  // Load stock on first render if a shop is selected
  if (shopId && stock.length === 0 && shops.length > 0) {
    loadStock(shopId)
  }

  const totalItems = stock.reduce((s, i) => s + i.quantityOnHand, 0)
  const totalValue = stock.reduce(
    (s, i) =>
      s.plus(new BigNumber(i.costPerUnitUgx).times(i.quantityOnHand)),
    new BigNumber(0),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shop</h1>
          <p className="text-muted-foreground">
            View shop inventory and record sales.
          </p>
        </div>
        <div className="flex gap-2">
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
      </div>

      {shops.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No shops configured yet. Create one in Settings.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Items in Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalItems}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Stock Value
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
                    <TableHead>Art #</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
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

  async function handleSubmit() {
    if (cart.length === 0) return
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
            const s = stock.find((x) => x.id === item.stockId)!
            const isBelowMin = new BigNumber(item.price || 0).lt(
              s.minimumSellPriceUgx,
            )
            return (
              <div
                key={item.stockId}
                className="flex items-center gap-2 p-2 border rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.productName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Min: {new BigNumber(s.minimumSellPriceUgx).toFormat(0)}
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={s.quantityOnHand}
                  className="w-16 text-right"
                  value={item.qty}
                  onChange={(e) =>
                    updateCart(item.stockId, "qty", e.target.value)
                  }
                />
                <span className="text-xs">x</span>
                <Input
                  type="number"
                  step="1"
                  className="w-28 text-right"
                  value={item.price}
                  onChange={(e) =>
                    updateCart(item.stockId, "price", e.target.value)
                  }
                />
                {isBelowMin && (
                  <Badge variant="destructive" className="text-xs">
                    Below min
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFromCart(item.stockId)}
                >
                  x
                </Button>
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
