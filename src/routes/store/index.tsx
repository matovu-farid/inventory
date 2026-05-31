import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { Fragment, useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import BigNumber from "bignumber.js"
import { formatUgx, formatUgxTotal } from "#/lib/format"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Badge } from "#/components/ui/badge"
import { InfoTip } from "#/components/ui/info-tip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"
import { SpecifyStockDialog } from "#/components/stock/specify-stock-dialog"
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
    const [groups, prerequisites] = await Promise.all([
      getStoreStock(),
      getStorePrereqs(),
    ])
    return { groups, prerequisites, role }
  },
  component: StoreStockPage,
})

type StoreStockGroups = Awaited<ReturnType<typeof getStoreStock>>
type StoreStockGroup = StoreStockGroups[number]

function StoreStockPage() {
  const { groups, prerequisites, role } = Route.useLoaderData()
  const router = useRouter()
  const canSeed = role === "admin" || role === "supervisor"

  const totalValue = groups.reduce((sum, g) => {
    const groupValue = g.rows.reduce(
      (s, r) =>
        s.plus(new BigNumber(r.costPerUnitUgx).times(r.quantityOnHand)),
      new BigNumber(0),
    )
    return sum.plus(groupValue)
  }, new BigNumber(0))
  const totalItems = groups.reduce((sum, g) => sum + g.totalQty, 0)

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

        {groups.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No stock in the warehouse. Receive goods from a supply route to get
            started.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted-foreground">
                {groups.length} product{groups.length === 1 ? "" : "s"} ·{" "}
                {totalItems} units
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" aria-label="Expand" />
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Article
                      <InfoTip term="col.articleNumber" />
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      Category
                      <InfoTip term="itemForm.category" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      Qty
                      <InfoTip term="col.qtyOnHand" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      Min Sell Price
                      <InfoTip term="item.minSellPrice" />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <ItemStockRow
                    key={g.item.id}
                    group={g}
                    onSpecified={() => void router.invalidate()}
                  />
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </PagePrerequisites>
    </div>
  )
}

function ItemStockRow({
  group,
  onSpecified,
}: {
  group: StoreStockGroup
  onSpecified: () => void
}) {
  const [open, setOpen] = useState(false)
  const [specifying, setSpecifying] = useState<string | null>(null)
  const lowStock =
    group.item.lowStockThreshold !== null &&
    group.totalQty < group.item.lowStockThreshold

  const specifyingRow =
    specifying === null
      ? null
      : (group.rows.find((r) => r.id === specifying) ?? null)

  return (
    <Fragment>
      <TableRow
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen((o) => !o)
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className="cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TableCell>
          {open ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
        </TableCell>
        <TableCell className="font-medium">
          {group.item.articleNumber}{" "}
          <span className="text-muted-foreground">{group.item.name}</span>
        </TableCell>
        <TableCell>{group.item.category}</TableCell>
        <TableCell className="text-right font-mono">
          {group.totalQty}
          {lowStock && (
            <Badge variant="destructive" className="ml-2">
              Low
            </Badge>
          )}
        </TableCell>
        <TableCell className="text-right font-mono">
          {formatUgx(group.item.minimumSellPriceUgx)}
        </TableCell>
      </TableRow>
      {open &&
        group.rows.map((r) => (
          <TableRow key={r.id} className="bg-muted/30">
            <TableCell />
            <TableCell className="pl-8 text-sm">
              {r.variant ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-3 rounded-full border"
                    style={{ backgroundColor: r.variant.color.colorHex }}
                    aria-hidden
                  />
                  {r.variant.color.colorName} · {r.variant.size}
                </span>
              ) : (
                <em className="text-muted-foreground">Unresolved</em>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.supplyRouteLine?.id.slice(0, 8) ?? "—"}
            </TableCell>
            <TableCell className="text-right font-mono">
              {r.quantityOnHand}
            </TableCell>
            <TableCell className="text-right">
              {!r.variant && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSpecifying(r.id)
                  }}
                >
                  Specify
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      {specifyingRow && (
        <SpecifyStockDialog
          open={true}
          onOpenChange={(next) => {
            if (!next) setSpecifying(null)
          }}
          storeStockId={specifyingRow.id}
          itemId={group.item.id}
          articleNumber={group.item.articleNumber}
          itemName={group.item.name}
          available={specifyingRow.quantityOnHand}
          itemColors={group.item.colors}
          onSuccess={() => {
            setSpecifying(null)
            onSpecified()
          }}
        />
      )}
    </Fragment>
  )
}
