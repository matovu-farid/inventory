import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Check } from "lucide-react"
import {
  getStoreStock,
  setMinimumSellPrice,
} from "#/server/functions/store/receiving"
import { ensureStore } from "#/server/functions/admin/locations"

export const Route = createFileRoute("/store/")({
  loader: async () => {
    await ensureStore()
    const stock = await getStoreStock()
    return { stock }
  },
  component: StoreStockPage,
})

function StoreStockPage() {
  const { stock } = Route.useLoaderData()

  const totalValue = stock.reduce(
    (sum, s) =>
      sum.plus(new BigNumber(s.costPerUnitUgx).times(s.quantityOnHand)),
    new BigNumber(0),
  )
  const totalItems = stock.reduce((sum, s) => sum + s.quantityOnHand, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Store Stock</h1>
        <p className="text-muted-foreground">
          Current warehouse inventory levels and pricing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inventory Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {totalValue.toFormat(0)}
            </div>
            <p className="text-xs text-muted-foreground">UGX (at cost)</p>
          </CardContent>
        </Card>
      </div>

      {stock.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No stock in the warehouse. Receive goods from a supply route to get
          started.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Art #</TableHead>
                <TableHead className="text-right">Qty On Hand</TableHead>
                <TableHead className="text-right">Cost/Unit (UGX)</TableHead>
                <TableHead className="text-right">Min Sell Price</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((s) => (
                <StockRow key={s.id} item={s} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function StockRow({
  item,
}: {
  item: {
    id: string
    productName: string
    articleNumber: string | null
    quantityOnHand: number
    costPerUnitUgx: string
    minimumSellPriceUgx: string
  }
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [minPrice, setMinPrice] = useState(item.minimumSellPriceUgx)
  const [saving, setSaving] = useState(false)

  const totalValue = new BigNumber(item.costPerUnitUgx).times(
    item.quantityOnHand,
  )

  async function saveMinPrice() {
    setSaving(true)
    try {
      await setMinimumSellPrice({
        data: {
          storeStockId: item.id,
          minimumSellPriceUgx: minPrice,
        },
      })
      setEditing(false)
      router.invalidate()
    } finally {
      setSaving(false)
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{item.productName}</TableCell>
      <TableCell className="text-muted-foreground">
        {item.articleNumber || "-"}
      </TableCell>
      <TableCell className="text-right">
        {item.quantityOnHand === 0 ? (
          <Badge variant="outline">Out of stock</Badge>
        ) : (
          item.quantityOnHand
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        {new BigNumber(item.costPerUnitUgx).toFormat(0)}
      </TableCell>
      <TableCell className="text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              className="w-28 text-right"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={saveMinPrice}
              disabled={saving}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            className="font-mono hover:underline cursor-pointer"
            onClick={() => setEditing(true)}
          >
            {new BigNumber(item.minimumSellPriceUgx).toFormat(0)}
          </button>
        )}
      </TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {totalValue.toFormat(0)}
      </TableCell>
    </TableRow>
  )
}
