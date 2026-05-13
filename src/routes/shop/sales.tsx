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
import { ResponsiveTable } from "#/components/ui/responsive-table"
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
        quantity: number
        unitPriceUgx: string
        isBelowMinimum: boolean
        shopStockItem: {
          size: string
          productColor: {
            colorName: string
            colorHex: string
            product: {
              articleNumber: string
              name: string
            }
          }
        }
      }>
      soldByUser: { id: string; name: string } | null
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
        ) : (
          <ResponsiveTable
            data={sales}
            getRowKey={(s) => s.id}
            columns={[
              {
                header: "Date",
                cell: (s) => new Date(s.saleDate).toLocaleString(),
              },
              {
                header: "Items",
                align: "left",
                cell: (s) => (
                  <div className="flex flex-col gap-1">
                    {s.items.map((i, idx) => {
                      const pc = i.shopStockItem.productColor
                      return (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="font-mono">{i.quantity}x {pc.product.articleNumber}</span>
                          <span className="text-muted-foreground">{pc.product.name}</span>
                          <span
                            className="inline-block h-3 w-3 rounded-full border"
                            style={{ backgroundColor: pc.colorHex }}
                            aria-hidden
                          />
                          <span className="text-muted-foreground text-xs">
                            {pc.colorName} / {i.shopStockItem.size}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ),
              },
              {
                header: "Payment",
                cell: (s) => <Badge variant="outline">{s.paymentMethod}</Badge>,
              },
              {
                header: "Clerk",
                cell: (s) => s.soldByUser?.name ?? "—",
                hideOnMobile: true,
              },
              {
                header: "Amount (UGX)",
                align: "right",
                cell: (s) => (
                  <span className="font-mono font-semibold">
                    {roundUgxFloor50(s.totalAmount).toFormat(0)}
                  </span>
                ),
              },
              {
                header: "Flags",
                cell: (s) => s.items.some((i) => i.isBelowMinimum) ? <Badge variant="destructive">Below min</Badge> : null,
              },
            ]}
            emptyMessage="No sales recorded yet for this shop."
          />
        )}
      </PagePrerequisites>
    </div>
  )
}
