import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { requireUiPermission } from "#/lib/permissions"
import BigNumber from "bignumber.js"
import { roundUgxFloor50, formatUgxTotal } from "#/lib/format"
import { Badge } from "#/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { listShopsWithSales, listShopSales } from "#/server/functions/shop/sales"
import { getShopSalesPrereqs } from "#/server/functions/prereqs/shop"

export const Route = createFileRoute("/shop/sales")({
  beforeLoad: ({ context }) => requireUiPermission(context, "sales.view"),
  loader: async () => {
    const [shops, prerequisites] = await Promise.all([
      listShopsWithSales(),
      getShopSalesPrereqs(),
    ])
    return { shops, prerequisites }
  },
  component: SalesPage,
})

function SalesPage() {
  const { shops, prerequisites } = Route.useLoaderData()
  const [shopId, setShopId] = useState(shops[0]?.id ?? "")
  const [sales, setSales] = useState<
    Array<{
      id: string
      saleDate: Date
      totalAmount: string
      paymentMethod: string
      items: Array<{
        productName: string
        quantity: number
        unitPriceUgx: string
        isBelowMinimum: boolean
      }>
    }>
  >([])

  async function loadSales(id: string) {
    setShopId(id)
    if (!id) { setSales([]); return }
    const s = await listShopSales({ data: { shopId: id } })
    setSales(s)
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
    if (shopId && shops.length > 0) loadSales(shopId)
  }, [shopId])

  const totalRevenue = sales.reduce(
    (s, sale) => s.plus(sale.totalAmount),
    new BigNumber(0),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales</h1>
        <p className="text-muted-foreground">
          View past sales by shop.
        </p>
      </div>
      <PagePrerequisites result={prerequisites}>
        {shops.length > 1 && (
          <div className="flex items-center justify-between">
            <div />
            <Select value={shopId} onValueChange={loadSales}>
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
          </div>
        )}

        {sales.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {sales.length} sales | Total revenue:{" "}
            <span className="font-mono font-semibold">
              {formatUgxTotal(totalRevenue)}
            </span>
          </p>
        )}

        {shops.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No sales recorded yet.
          </p>
        ) : sales.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No sales recorded yet for this shop.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount (UGX)</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => {
                  const hasBelowMin = sale.items.some((i) => i.isBelowMinimum)
                  return (
                    <TableRow key={sale.id}>
                      <TableCell>
                        {new Date(sale.saleDate).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {sale.items
                          .map((i) => `${i.quantity}x ${i.productName}`)
                          .join(", ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{sale.paymentMethod}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {roundUgxFloor50(sale.totalAmount).toFormat(0)}
                      </TableCell>
                      <TableCell>
                        {hasBelowMin && (
                          <Badge variant="destructive">Below min</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PagePrerequisites>
    </div>
  )
}
