import { createFileRoute, Link } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import BigNumber from "bignumber.js"
import { formatUgxTotal } from "#/lib/format"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { InfoTip } from "#/components/ui/info-tip"
import { Plus } from "lucide-react"
import { ProductCard } from "#/components/products/product-card"
import { aggregateStockByArticle } from "#/lib/products"
import { getStoreStock } from "#/server/functions/store/receiving"
import { ensureStore } from "#/server/functions/admin/locations"
import { getSession } from "#/server/middleware/auth"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { getStorePrereqs } from "#/server/functions/prereqs/store"

export const Route = createFileRoute("/store/")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "warehouse.stock"),
  loader: async () => {
    await ensureStore()
    const session = await getSession()
    const role = (session?.user as { role?: string } | undefined)?.role ?? null
    const [stock, prerequisites] = await Promise.all([
      getStoreStock(),
      getStorePrereqs(),
    ])
    return { stock, prerequisites, role }
  },
  component: StoreStockPage,
})

function StoreStockPage() {
  const { stock, prerequisites, role } = Route.useLoaderData()
  const canSeed = role === "admin" || role === "supervisor"

  const totalValue = stock.reduce(
    (sum, s) =>
      sum.plus(new BigNumber(s.costPerUnitUgx).times(s.quantityOnHand)),
    new BigNumber(0),
  )
  const totalItems = stock.reduce((sum, s) => sum + s.quantityOnHand, 0)
  const aggregated = aggregateStockByArticle(stock)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Store Stock</h1>
          <p className="text-muted-foreground">
            Current warehouse inventory levels and pricing.
          </p>
        </div>
        {canSeed && (
          <Button asChild variant="outline" size="sm">
            <Link to="/store/opening-balance">
              <Plus className="mr-1 h-4 w-4" />
              Add Existing Stock
            </Link>
          </Button>
        )}
      </div>

      <PagePrerequisites result={prerequisites}>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Total Items
                <InfoTip term="kpi.totalItemsStore" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Inventory Value
                <InfoTip term="kpi.inventoryValue" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatUgxTotal(totalValue)}
              </div>
              <p className="text-xs text-muted-foreground">at cost</p>
            </CardContent>
          </Card>
        </div>

        {aggregated.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No stock in the warehouse. Receive goods from a supply route to get
            started.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted-foreground">
                {aggregated.length} product{aggregated.length === 1 ? "" : "s"} ·{" "}
                {aggregated.reduce((s, a) => s + a.total, 0)} units
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {aggregated.map((a) => (
                <ProductCard
                  key={a.product.articleNumber}
                  data={{
                    articleNumber: a.product.articleNumber,
                    name: a.product.name,
                    // Per-variant counts via variant_id joins (#4) —
                    // the ItemCard derives the size grid from these.
                    variants: a.variants,
                    colors: a.colors,
                    totalQuantity: a.total,
                    locationCounts: [{ label: "Store", qty: a.total }],
                  }}
                />
              ))}
            </div>
          </>
        )}
      </PagePrerequisites>
    </div>
  )
}
