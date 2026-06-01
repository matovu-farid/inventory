import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect, useCallback } from "react"
import { requireUiPermission } from "#/lib/permissions"
import BigNumber from "bignumber.js"
import { roundUgxFloor50, formatUgxTotal, formatDateTime } from "#/lib/format"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Printer } from "lucide-react"
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
import { printSaleReceipt } from "#/lib/pos/print-receipt"

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
          // Stock references a single variant_id; the joined variant
          // carries size + color (with parent item/product). After the
          // variant-flexibility Plan 2 Task 1 schema flip the join can be
          // null for unresolved lots — Plan 2b will rewrite the sales
          // table to handle item-level sale lines. Until then we render
          // a placeholder for unresolved rows.
          variant: {
            size: string
            color: {
              colorName: string
              colorHex: string
              item: {
                articleNumber: string
                name: string
              }
            }
          } | null
        } | null
      }>
      soldByUser: { id: string; name: string } | null
    }>
  >([])

  const loadSales = useCallback(async (id: string) => {
    setShopId(id)
    if (!id) { setSales([]); return }
    const s = await listShopSales({ data: { shopId: id } })
    setSales(s)
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
    if (shopId && shopsLength > 0) void loadSales(shopId)
  }, [shopId, shopsLength, loadSales])

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
            <Select value={shopId} onValueChange={(v) => { void loadSales(v) }}>
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
                cell: (s) => formatDateTime(s.saleDate),
              },
              {
                header: "Items",
                align: "left",
                cell: (s) => (
                  <div className="flex flex-col gap-1">
                    {s.items.map((i, idx) => {
                      const v = i.shopStockItem?.variant ?? null
                      if (!v) {
                        // Plan 2a: an unresolved shop_stock row sneaked
                        // into a sale. Sales don't actually allow this
                        // today (recordSale rejects it), so this is just
                        // a visual fallback for legacy/edge data.
                        return (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span className="font-mono">{i.quantity}x</span>
                            <span className="text-muted-foreground text-xs">
                              unresolved item
                            </span>
                          </div>
                        )
                      }
                      return (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="font-mono">{i.quantity}x {v.color.item.articleNumber}</span>
                          <span className="text-muted-foreground">{v.color.item.name}</span>
                          <span
                            className="inline-block h-3 w-3 rounded-full border"
                            style={{ backgroundColor: v.color.colorHex }}
                            aria-hidden
                          />
                          <span className="text-muted-foreground text-xs">
                            {v.color.colorName} / {v.size}
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
              {
                header: "Receipt",
                cell: (s) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={`Print receipt for sale ${s.id}`}
                    onClick={() => {
                      printSaleReceipt(s.id).catch((e) => {
                        console.error("print failed:", e)
                        alert(e instanceof Error ? e.message : "Could not print receipt")
                      })
                    }}
                  >
                    <Printer className="size-4" strokeWidth={1.75} />
                  </Button>
                ),
              },
            ]}
            emptyMessage="No sales recorded yet for this shop."
          />
        )}
      </PagePrerequisites>
    </div>
  )
}
