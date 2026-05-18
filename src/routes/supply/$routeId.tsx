import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import * as React from "react"
import { useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Textarea } from "#/components/ui/textarea"
import { MoneyInput, RateInput } from "#/components/ui/money-input"
import { FieldLabel } from "#/components/ui/field-label"
import { InfoTip } from "#/components/ui/info-tip"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Separator } from "#/components/ui/separator"
import { Combobox } from "#/components/ui/combobox"
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
import { ResponsiveTable } from "#/components/ui/responsive-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Plus, Trash2, ArrowRight, Split, X, ChevronDown, ChevronRight } from "lucide-react"
import {
  getSupplyRoute,
  updateSupplyRoute,
  listSuppliersForSelect,
} from "#/server/functions/supply/routes"
import {
  addSupplyRouteVariants,
  deleteSupplyRouteItem,
  splitSupplyRouteItem,
} from "#/server/functions/supply/items"
import {
  ProductPicker
  
} from "#/components/products/product-picker"
import type {ProductSummary} from "#/components/products/product-picker";
import { ProductEditor } from "#/components/products/product-editor"
import { ColorEditor } from "#/components/products/color-editor"
import { VariantGrid } from "#/components/products/variant-grid"
import { getProductByArticle } from "#/server/functions/products/products"
import { deleteProductColor } from "#/server/functions/products/colors"
import {
  addSupplyRouteExpense,
  deleteSupplyRouteExpense,
} from "#/server/functions/supply/expenses"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { getSupplyRouteDetailPrereqs } from "#/server/functions/prereqs/supply"
import { roundUgxFloor50, roundUgxBankers50, formatUgxTotal } from "#/lib/format"

export const Route = createFileRoute("/supply/$routeId")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "procurement.view"),
  loader: async ({ params }) => {
    const [route, suppliers, prerequisites] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      listSuppliersForSelect(),
      getSupplyRouteDetailPrereqs(),
    ])
    return { route, suppliers, prerequisites }
  },
  component: RouteDetailPage,
})

const STATUSES = [
  "planning",
  "in_transit",
  "received",
] as const

const EXPENSE_CATEGORIES = [
  "freight",
  "shipping",
  "customs",
  "ticket",
  "transportation",
  "insurance",
  "rent",
  "salary",
  "tax",
  "miscellaneous",
] as const

function expenseAmountUgx(exp: {
  amount: string
  currency?: string | null
  exchangeRate?: string | null
}): BigNumber {
  const amount = new BigNumber(exp.amount)
  const currency = exp.currency ?? "UGX"
  if (currency === "UGX") return amount
  if (!exp.exchangeRate) return amount
  return amount.times(new BigNumber(exp.exchangeRate))
}

function RouteDetailPage() {
  const { route, suppliers, prerequisites } = Route.useLoaderData()
  const router = useRouter()
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [splittingItemId, setSplittingItemId] = useState<string | null>(null)
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  )
  const splittingItem = route.items.find((i) => i.id === splittingItemId) ?? null

  type RouteItem = (typeof route.items)[number]
  const groupedItems = React.useMemo(() => {
    const groups = new Map<
      string,
      { name: string; articleNumber: string; items: RouteItem[] }
    >()
    for (const item of route.items) {
      const product = item.productColor?.product ?? item.product
      if (!product) continue
      const key = product.articleNumber
      let group = groups.get(key)
      if (!group) {
        group = { name: product.name, articleNumber: key, items: [] }
        groups.set(key, group)
      }
      group.items.push(item)
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  }, [route.items])

  function toggleProduct(articleNumber: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(articleNumber)) next.delete(articleNumber)
      else next.add(articleNumber)
      return next
    })
  }

  const totalItemCost = route.items.reduce(
    (sum, i) => sum.plus(i.totalCostUgx),
    new BigNumber(0),
  )
  const totalExpenses = route.expenses.reduce(
    (sum, e) => sum.plus(expenseAmountUgx(e)),
    new BigNumber(0),
  )
  const grandTotal = totalItemCost.plus(totalExpenses)

  async function handleStatusChange(status: string) {
    await updateSupplyRoute({
      data: {
        id: route.id,
        status: status as (typeof STATUSES)[number],
      },
    })
    void router.invalidate()
  }

  async function handleDeleteItem(id: string) {
    await deleteSupplyRouteItem({ data: { id } })
    void router.invalidate()
  }

  async function handleDeleteExpense(id: string) {
    await deleteSupplyRouteExpense({ data: { id } })
    void router.invalidate()
  }

  // Build supplier lookup for items form
  const routeSupplierIds = route.suppliers.map((s) => s.supplier.id)
  const routeSuppliers = suppliers.filter((s) =>
    routeSupplierIds.includes(s.id),
  )

  return (
    <div className="space-y-6">
      {/* Header - outside PagePrerequisites */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{route.name}</h1>
          <p className="text-muted-foreground text-sm">
            {route.suppliers.map((s) => s.supplier.name).join(", ") ||
              "No suppliers linked"}
            {route.departureDate && ` | Departed: ${route.departureDate}`}
            {route.returnDate && ` | Returned: ${route.returnDate}`}
          </p>
        </div>
        <Select value={route.status} onValueChange={(v) => { void handleStatusChange(v) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PagePrerequisites result={prerequisites}>

        <TripRatesSection route={route} />

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Item Costs
                <InfoTip term="kpi.itemCosts" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatUgxTotal(totalItemCost)}
              </div>
              <p className="text-xs text-muted-foreground">
                {route.items.length} items
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Expenses
                <InfoTip term="kpi.expenses" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatUgxTotal(totalExpenses)}
              </div>
              <p className="text-xs text-muted-foreground">
                {route.expenses.length} entries
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Grand Total
                <InfoTip term="kpi.grandTotal" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatUgxTotal(grandTotal)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* Items Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Items</h2>
            <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Add Item</DialogTitle>
                </DialogHeader>
                <AddItemForm
                  supplyRouteId={route.id}
                  suppliers={
                    routeSuppliers.length > 0 ? routeSuppliers : suppliers
                  }
                  rateUgxPerUsd={route.rateUgxPerUsd}
                  rateRmbPerUsd={route.rateRmbPerUsd}
                  onSuccess={() => {
                    setItemDialogOpen(false)
                    void router.invalidate()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {groupedItems.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No items added yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Article
                    </TableHead>
                    <TableHead>Color · Size</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Supplier
                    </TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Unit Price
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Total (Foreign)
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Total (USD)
                    </TableHead>
                    <TableHead className="text-right">Total (UGX)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedItems.map((group) => {
                    const expanded = expandedProducts.has(group.articleNumber)
                    const totalQty = group.items.reduce(
                      (s, i) => s + i.quantity,
                      0,
                    )
                    const totalForeign = group.items.reduce(
                      (s, i) => s.plus(i.totalAmountForeign),
                      new BigNumber(0),
                    )
                    const totalUsd = group.items.reduce(
                      (s, i) =>
                        i.totalAmountUsd
                          ? s.plus(i.totalAmountUsd)
                          : s,
                      new BigNumber(0),
                    )
                    const totalUgx = group.items.reduce(
                      (s, i) => s.plus(i.totalCostUgx),
                      new BigNumber(0),
                    )
                    const foreignCurrencies = Array.from(
                      new Set(group.items.map((i) => i.foreignCurrency)),
                    )
                    return (
                      <React.Fragment key={group.articleNumber}>
                        <TableRow
                          className="cursor-pointer bg-muted/30 font-medium hover:bg-muted/60"
                          onClick={() => toggleProduct(group.articleNumber)}
                          aria-expanded={expanded}
                        >
                          <TableCell className="text-center">
                            {expanded ? (
                              <ChevronDown className="size-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell>{group.name}</TableCell>
                          <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                            {group.articleNumber}
                            <InfoTip term="col.articleNumber" />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {group.items.length} variant
                            {group.items.length === 1 ? "" : "s"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell" />
                          <TableCell className="text-right font-mono">
                            {totalQty}
                          </TableCell>
                          <TableCell className="hidden md:table-cell" />
                          <TableCell className="hidden text-right font-mono md:table-cell">
                            {totalForeign.toFormat(2)}
                            {foreignCurrencies.length === 1 && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {foreignCurrencies[0]}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono md:table-cell">
                            {totalUsd.gt(0) ? totalUsd.toFormat(2) : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {roundUgxBankers50(totalUgx).toFormat(0)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                        {expanded &&
                          group.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell />
                              <TableCell className="text-muted-foreground text-xs">
                                {/* keep product column empty in detail rows */}
                              </TableCell>
                              <TableCell className="hidden md:table-cell" />
                              <TableCell>
                                {item.productColor ? (
                                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <span
                                      className="inline-block size-3 rounded-full border"
                                      style={{
                                        backgroundColor:
                                          item.productColor.colorHex,
                                      }}
                                      aria-hidden
                                    />
                                    {item.productColor.colorName}
                                    {item.size ? ` · ${item.size}` : ""}
                                  </span>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    All variants
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {item.supplier.name}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="hidden text-right font-mono md:table-cell">
                                {new BigNumber(item.unitPriceForeign).toFormat(
                                  2,
                                )}{" "}
                                <span className="text-muted-foreground text-xs">
                                  {item.foreignCurrency}
                                </span>
                              </TableCell>
                              <TableCell className="hidden text-right font-mono md:table-cell">
                                {new BigNumber(
                                  item.totalAmountForeign,
                                ).toFormat(2)}
                              </TableCell>
                              <TableCell className="hidden text-right font-mono md:table-cell">
                                {item.totalAmountUsd
                                  ? new BigNumber(item.totalAmountUsd).toFormat(
                                      2,
                                    )
                                  : "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {roundUgxBankers50(item.totalCostUgx).toFormat(
                                  0,
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  {(!item.productColor || !item.size) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7"
                                      onClick={() =>
                                        setSplittingItemId(item.id)
                                      }
                                    >
                                      <Split className="mr-1 h-3.5 w-3.5" />
                                      Split
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => {
                                      void handleDeleteItem(item.id)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </React.Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Dialog
          open={splittingItem !== null}
          onOpenChange={(open) => !open && setSplittingItemId(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Split into variants</DialogTitle>
            </DialogHeader>
            {splittingItem && (
              <SplitItemForm
                item={splittingItem}
                onSuccess={() => {
                  setSplittingItemId(null)
                  void router.invalidate()
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        <Separator />

        {/* Expenses Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Expenses</h2>
            <Dialog
              open={expenseDialogOpen}
              onOpenChange={setExpenseDialogOpen}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Expense</DialogTitle>
                </DialogHeader>
                <AddExpenseForm
                  supplyRouteId={route.id}
                  rateUgxPerUsd={route.rateUgxPerUsd}
                  onSuccess={() => {
                    setExpenseDialogOpen(false)
                    void router.invalidate()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          <ResponsiveTable
            data={route.expenses}
            getRowKey={(exp) => exp.id}
            emptyMessage="No expenses recorded yet."
            columns={[
              {
                header: "Category",
                cell: (exp) => (
                  <Badge variant="outline">{exp.category}</Badge>
                ),
              },
              {
                header: "Description",
                cell: (exp) => exp.description || "-",
              },
              {
                header: "Amount",
                align: "right",
                hideOnMobile: true,
                cell: (exp) => (
                  <span className="font-mono">
                    {new BigNumber(exp.amount).toFormat(
                      exp.currency === "UGX" ? 0 : 2,
                    )}{" "}
                    <span className="text-muted-foreground text-xs">
                      {exp.currency ?? "UGX"}
                    </span>
                  </span>
                ),
              },
              {
                header: "Rate",
                align: "right",
                hideOnMobile: true,
                cell: (exp) =>
                  exp.currency && exp.currency !== "UGX" && exp.exchangeRate ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {new BigNumber(exp.exchangeRate).toFormat(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  ),
              },
              {
                header: "Total (UGX)",
                align: "right",
                cell: (exp) => (
                  <span className="font-mono font-semibold">
                    {roundUgxFloor50(expenseAmountUgx(exp).toString()).toFormat(0)}
                  </span>
                ),
              },
              {
                header: "",
                cell: (exp) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => { void handleDeleteExpense(exp.id) }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </PagePrerequisites>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Split Item Form — promote aggregate / color-only to full variants   */
/* ------------------------------------------------------------------ */

interface SplittableItem {
  id: string
  quantity: number
  product?: { articleNumber: string; name: string } | null
  productColor?: {
    id: string
    colorName: string
    colorHex: string
    product: { articleNumber: string; name: string }
  } | null
  size: string | null
}

function SplitItemForm({
  item,
  onSuccess,
}: {
  item: SplittableItem
  onSuccess: () => void
}) {
  const articleNumber =
    item.productColor?.product.articleNumber ?? item.product?.articleNumber
  const [product, setProduct] = useState<ProductSummary | undefined>()
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<"colors" | "variants">(
    item.productColor ? "variants" : "variants",
  )
  const [colorQtys, setColorQtys] = useState<Record<string, number>>({})
  const [cellQtys, setCellQtys] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the product so we know the available colors + sizes.
   
  React.useEffect(() => {
    if (!articleNumber) {
      setLoading(false)
      return
    }
    void (async () => {
      const p = await getProductByArticle({ data: { articleNumber } })
      if (p) setProduct(p)
      setLoading(false)
    })()
  }, [articleNumber])

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading product…</p>
    )
  }
  if (!product) {
    return (
      <p className="text-sm text-destructive">Could not load product</p>
    )
  }

  // For color-only items, the color is already fixed.
  const lockedColor = item.productColor ?? null
  const colorsToUse = lockedColor ? [lockedColor] : product.colors

  const allCells: Array<{
    productColorId: string
    size?: string
    quantity: number
  }> =
    mode === "colors"
      ? Object.entries(colorQtys)
          .filter(([, q]) => q > 0)
          .map(([colorId, q]) => ({ productColorId: colorId, quantity: q }))
      : Object.entries(cellQtys)
          .filter(([, q]) => q > 0)
          .map(([key, q]) => {
            const [productColorId, size] = key.split("|")
            return { productColorId, size, quantity: q }
          })

  const total = allCells.reduce((s, c) => s + c.quantity, 0)
  const mismatch = total !== item.quantity

  async function submit() {
    if (allCells.length === 0 || mismatch) return
    setPending(true)
    setError(null)
    try {
      await splitSupplyRouteItem({
        data: { itemId: item.id, cells: allCells },
      })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to split")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p>
          <span className="font-medium">{product.articleNumber}</span> —{" "}
          {product.name}
        </p>
        <p className="text-muted-foreground">
          Original quantity: <span className="font-mono">{item.quantity}</span>
          {lockedColor ? (
            <>
              {" · Color locked to "}
              <span className="font-medium">{lockedColor.colorName}</span>
            </>
          ) : null}
        </p>
      </div>

      {!lockedColor && (
        <div className="space-y-1.5">
          <FieldLabel help="item.detailMode">Split into</FieldLabel>
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("colors")}
              className={
                "px-3 py-1.5 rounded transition-colors " +
                (mode === "colors"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              Colors only
            </button>
            <button
              type="button"
              onClick={() => setMode("variants")}
              className={
                "px-3 py-1.5 rounded transition-colors " +
                (mode === "variants"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              Colors × sizes
            </button>
          </div>
        </div>
      )}

      {mode === "colors" && !lockedColor && (
        <ColorQuantityList
          colors={product.colors}
          values={colorQtys}
          onChange={setColorQtys}
        />
      )}

      {(mode === "variants" || lockedColor) && (
        <VariantGrid
          sizes={product.sizes}
          colors={colorsToUse}
          quantities={cellQtys}
          onChange={setCellQtys}
        />
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Allocated: <span className="font-mono">{total}</span> of{" "}
          <span className="font-mono">{item.quantity}</span>
        </span>
        {mismatch && (
          <span className="text-destructive">
            Must equal {item.quantity}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={() => { void submit() }}
        disabled={pending || mismatch || allCells.length === 0}
        className="w-full"
      >
        {pending ? "Splitting…" : "Save split"}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Color quantity list — Per-color procurement input                   */
/* ------------------------------------------------------------------ */

function ColorQuantityList({
  colors,
  values,
  onChange,
  onRemoveColor,
  error,
}: {
  colors: Array<{ id: string; colorName: string; colorHex: string }>
  values: Record<string, number>
  onChange: (v: Record<string, number>) => void
  onRemoveColor?: (colorId: string) => void
  error?: string
}) {
  if (colors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add at least one color to enter quantities.
      </p>
    )
  }
  function set(colorId: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    const next = { ...values, [colorId]: n }
    if (n === 0) delete next[colorId]
    onChange(next)
  }
  const total = Object.values(values).reduce((s, n) => s + n, 0)
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <tbody>
            {colors.map((c) => (
              <tr key={c.id} className="border-t first:border-t-0">
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block size-4 rounded border"
                      style={{ backgroundColor: c.colorHex }}
                      aria-hidden
                    />
                    {c.colorName}
                  </span>
                </td>
                <td className="p-1.5 w-32">
                  <MoneyInput
                    value={c.id in values ? values[c.id].toString() : ""}
                    onChange={(v) => set(c.id, v)}
                    decimals={0}
                    placeholder="0"
                  />
                </td>
                {onRemoveColor && (
                  <td className="p-1 w-10 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${c.colorName}`}
                      onClick={() => onRemoveColor(c.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Total units: <span className="font-mono">{total}</span>
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Add Item Form                                                       */
/* ------------------------------------------------------------------ */

function AddItemForm({
  supplyRouteId,
  suppliers,
  rateUgxPerUsd,
  rateRmbPerUsd,
  onSuccess,
}: {
  supplyRouteId: string
  suppliers: Array<{ id: string; name: string }>
  rateUgxPerUsd?: string | null
  rateRmbPerUsd?: string | null
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [supplierId, setSupplierId] = useState(
    suppliers.length === 1 ? suppliers[0].id : "",
  )
  const [product, setProduct] = useState<ProductSummary | undefined>()
  const [productEditorOpen, setProductEditorOpen] = useState(false)
  const [colorEditorOpen, setColorEditorOpen] = useState(false)
  // Procurement detail level. Aggregate = total qty only; colors = qty per
  // color; variants = qty per color × size (the existing behaviour).
  const [detailMode, setDetailMode] = useState<"aggregate" | "colors" | "variants">(
    "variants",
  )
  const [aggregateQty, setAggregateQty] = useState("")
  const [colorQtys, setColorQtys] = useState<Record<string, number>>({})
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [unitPrice, setUnitPrice] = useState("")
  const initialCurrency = "RMB"
  const initialFxToUsd = rateRmbPerUsd ?? ""
  const [currency, setCurrency] = useState<string>(initialCurrency)
  const [fxToUsd, setFxToUsd] = useState(initialFxToUsd)
  const [usdToUgx, setUsdToUgx] = useState(rateUgxPerUsd ?? "")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  function handleCurrencyChange(next: string) {
    setCurrency(next)
    if (next === "RMB") setFxToUsd(rateRmbPerUsd ?? "")
    else setFxToUsd("")
  }

  async function refreshProduct(articleNumber: string) {
    const p = await getProductByArticle({ data: { articleNumber } })
    if (p) setProduct(p)
  }

  async function handleRemoveColor(productColorId: string) {
    if (!product) return
    const colorName =
      product.colors.find((c) => c.id === productColorId)?.colorName ?? "this color"
    if (!confirm(`Remove "${colorName}" from this product?`)) return
    try {
      await deleteProductColor({ data: { id: productColorId } })
      setQuantities((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) {
          if (k.startsWith(`${productColorId}|`)) delete next[k]
        }
        return next
      })
      setColorQtys((prev) => {
        if (!(productColorId in prev)) return prev
        const next = { ...prev }
        delete next[productColorId]
        return next
      })
      await refreshProduct(product.articleNumber)
      setFormErrors((prev) => {
        if (!prev.removeColor) return prev
        const { removeColor: _, ...rest } = prev
        return rest
      })
    } catch (err) {
      setFormErrors((prev) => ({
        ...prev,
        removeColor:
          err instanceof Error
            ? err.message
            : `Could not remove "${colorName}" — it may be in use.`,
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cells: Array<{
      productColorId?: string
      size?: string
      quantity: number
    }> =
      detailMode === "aggregate"
        ? aggregateQty && Number(aggregateQty) > 0
          ? [{ quantity: Number(aggregateQty) }]
          : []
        : detailMode === "colors"
          ? Object.entries(colorQtys)
              .filter(([, q]) => q > 0)
              .map(([productColorId, q]) => ({
                productColorId,
                quantity: q,
              }))
          : Object.entries(quantities)
              .filter(([, q]) => q > 0)
              .map(([key, q]) => {
                const [productColorId, size] = key.split("|")
                return { productColorId, size, quantity: q }
              })

    const errs: Record<string, string> = {}
    if (!supplierId) errs.supplierId = "Select a supplier"
    if (!product) errs.product = "Pick a product"
    if (cells.length === 0) errs.quantities = "Enter at least one quantity"
    if (!unitPrice || Number(unitPrice) <= 0) errs.unitPrice = "Enter a valid price"
    if (currency !== "UGX") {
      if (currency !== "USD") {
        if (!fxToUsd || Number(fxToUsd) <= 0) errs.fxToUsd = "Enter a valid rate"
      }
      if (!usdToUgx || Number(usdToUgx) <= 0) errs.usdToUgx = "Enter a valid rate"
    }
    setFormErrors(errs)
    if (Object.keys(errs).length > 0 || !product) return

    setPending(true)
    try {
      await addSupplyRouteVariants({
        data: {
          supplyRouteId,
          supplierId,
          productId: product.id,
          unitPriceForeign: unitPrice,
          foreignCurrency: currency,
          exchangeRateForeignToUsd:
            currency !== "UGX" && currency !== "USD"
              ? fxToUsd || undefined
              : undefined,
          exchangeRateUsdToUgx:
            currency !== "UGX" ? usdToUgx || undefined : undefined,
          cells,
        },
      })
      onSuccess()
    } catch (err) {
      setFormErrors({
        form: err instanceof Error ? err.message : "Failed to save",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
      <div className="space-y-2">
        <FieldLabel htmlFor="supplierId" help="item.supplierId">Supplier *</FieldLabel>
        <Combobox
          id="supplierId"
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          value={supplierId}
          onChange={setSupplierId}
          placeholder="Select supplier"
          searchPlaceholder="Search suppliers..."
          emptyMessage={
            <div className="space-y-1.5">
              <p>No suppliers found.</p>
              <Link
                to="/supply/suppliers"
                className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
              >
                Add a supplier
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          }
          aria-invalid={!!formErrors.supplierId}
        />
        {formErrors.supplierId && (
          <p className="text-xs text-destructive">{formErrors.supplierId}</p>
        )}
      </div>

      <div className="space-y-2">
        <FieldLabel help="item.productName">Product *</FieldLabel>
        <ProductPicker
          value={product?.id}
          onChange={(_, p) => {
            setProduct(p)
            setQuantities({})
          }}
          onCreateNew={() => setProductEditorOpen(true)}
        />
        {formErrors.product && (
          <p className="text-xs text-destructive">{formErrors.product}</p>
        )}
      </div>

      {product && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {product.articleNumber} — {product.name}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setColorEditorOpen(true)}
            >
              <Plus className="mr-1 size-3" /> Add color
            </Button>
          </div>

          <div className="space-y-1.5">
            <FieldLabel help="item.detailMode">Detail level</FieldLabel>
            <div className="inline-flex rounded-md border p-0.5 text-xs">
              {(
                [
                  { value: "aggregate", label: "Total only" },
                  { value: "colors", label: "Per color" },
                  { value: "variants", label: "Per color × size" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDetailMode(opt.value)}
                  className={
                    "px-3 py-1.5 rounded transition-colors " +
                    (detailMode === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted")
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {detailMode === "aggregate"
                ? "Just record how many units you're buying. An admin can split into colors/sizes later before receiving."
                : detailMode === "colors"
                  ? "Record quantity per color. Sizes can be filled in later."
                  : "Full breakdown by color and size."}
            </p>
          </div>

          {detailMode === "aggregate" && (
            <div className="space-y-2">
              <FieldLabel help="item.aggregateQty">Total quantity *</FieldLabel>
              <MoneyInput
                value={aggregateQty}
                onChange={setAggregateQty}
                decimals={0}
                placeholder="0"
                error={formErrors.quantities}
              />
            </div>
          )}

          {detailMode === "colors" && (
            <ColorQuantityList
              colors={product.colors}
              values={colorQtys}
              onChange={setColorQtys}
              onRemoveColor={handleRemoveColor}
              error={formErrors.quantities}
            />
          )}

          {detailMode === "variants" && (
            <>
              <VariantGrid
                sizes={product.sizes}
                colors={product.colors}
                quantities={quantities}
                onChange={setQuantities}
                onRemoveColor={handleRemoveColor}
              />
              {formErrors.quantities && (
                <p className="text-xs text-destructive">
                  {formErrors.quantities}
                </p>
              )}
            </>
          )}
          {formErrors.removeColor && (
            <p className="text-xs text-destructive">{formErrors.removeColor}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel help="item.unitPrice">Unit Price *</FieldLabel>
          <MoneyInput
            currency={currency}
            value={unitPrice}
            onChange={setUnitPrice}
            placeholder="0"
            error={formErrors.unitPrice}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel help="item.currency">Currency</FieldLabel>
          <Select value={currency} onValueChange={handleCurrencyChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RMB">RMB</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="UGX">UGX</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {currency !== "UGX" && (
        <div className="grid grid-cols-2 gap-4">
          {currency !== "USD" && (
            <div className="space-y-2">
              <FieldLabel help="item.sourceRate">{currency} per 1 USD *</FieldLabel>
              <RateInput
                label={`${currency}/USD`}
                value={fxToUsd}
                onChange={setFxToUsd}
                decimals={6}
                placeholder={`e.g. 7.25`}
                error={formErrors.fxToUsd}
              />
            </div>
          )}
          <div className="space-y-2">
            <FieldLabel help="item.ugxPerUsd">UGX per 1 USD *</FieldLabel>
            <RateInput
              label="UGX/USD"
              value={usdToUgx}
              onChange={setUsdToUgx}
              decimals={2}
              placeholder="e.g. 3750"
              error={formErrors.usdToUgx}
            />
          </div>
        </div>
      )}

      {formErrors.form && (
        <p className="text-sm text-destructive">{formErrors.form}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding..." : "Add Items"}
      </Button>

      <Dialog open={productEditorOpen} onOpenChange={setProductEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New product</DialogTitle>
          </DialogHeader>
          <ProductEditor
            onCreated={(_id, articleNumber) => {
              setProductEditorOpen(false)
              void refreshProduct(articleNumber)
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={colorEditorOpen} onOpenChange={setColorEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add color</DialogTitle>
          </DialogHeader>
          {product && (
            <ColorEditor
              productId={product.id}
              onCreated={() => {
                setColorEditorOpen(false)
                void refreshProduct(product.articleNumber)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Add Expense Form                                                    */
/* ------------------------------------------------------------------ */

function AddExpenseForm({
  supplyRouteId,
  rateUgxPerUsd,
  onSuccess,
}: {
  supplyRouteId: string
  rateUgxPerUsd?: string | null
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<string>("USD")
  const [usdToUgx, setUsdToUgx] = useState(rateUgxPerUsd ?? "")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    const errs: Record<string, string> = {}
    if (!category) errs.category = "Select a category"
    if (!amount || Number(amount) <= 0) errs.amount = "Enter a valid amount"
    if (currency !== "UGX" && (!usdToUgx || Number(usdToUgx) <= 0)) {
      errs.usdToUgx = "Enter a valid rate"
    }
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPending(true)
    try {
      await addSupplyRouteExpense({
        data: {
          supplyRouteId,
          category: category as (typeof EXPENSE_CATEGORIES)[number],
          description: (form.get("description") as string) || undefined,
          amount,
          currency,
          exchangeRate: currency !== "UGX" ? usdToUgx : undefined,
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to add expense:", err)
      setFormErrors({
        form: err instanceof Error ? err.message : "Failed to save",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
      <div className="space-y-2">
        <FieldLabel htmlFor="category" help="expense.category">Category *</FieldLabel>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-invalid={!!formErrors.category || undefined}>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formErrors.category && (
          <p className="text-xs text-destructive">{formErrors.category}</p>
        )}
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="description" help="expense.description">Description</FieldLabel>
        <Textarea id="description" name="description" rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel help="expense.amount">Amount *</FieldLabel>
          <MoneyInput
            currency={currency}
            decimals={currency === "UGX" ? 0 : 2}
            roundTo={currency === "UGX" ? 50 : undefined}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            error={formErrors.amount}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel help="item.currency">Currency</FieldLabel>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="UGX">UGX</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {currency !== "UGX" && (
        <div className="space-y-2">
          <FieldLabel help="item.ugxPerUsd">UGX per 1 USD *</FieldLabel>
          <RateInput
            label="UGX/USD"
            value={usdToUgx}
            onChange={setUsdToUgx}
            decimals={2}
            placeholder="e.g. 3750"
            error={formErrors.usdToUgx}
          />
        </div>
      )}

      {formErrors.form && (
        <p className="text-sm text-destructive">{formErrors.form}</p>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding..." : "Add Expense"}
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Trip Rates Section                                                  */
/* ------------------------------------------------------------------ */

function TripRatesSection({
  route,
}: {
  route: {
    id: string
    rateUgxPerUsd: string | null
    rateRmbPerUsd: string | null
  }
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [ugxPerUsd, setUgxPerUsd] = useState(route.rateUgxPerUsd ?? "")
  const [rmbPerUsd, setRmbPerUsd] = useState(route.rateRmbPerUsd ?? "")

  async function handleSave() {
    setPending(true)
    try {
      await updateSupplyRoute({
        data: {
          id: route.id,
          rateUgxPerUsd: ugxPerUsd || undefined,
          rateRmbPerUsd: rmbPerUsd || undefined,
        },
      })
      setEditing(false)
      void router.invalidate()
    } catch (err) {
      console.error("Failed to update trip rates:", err)
    } finally {
      setPending(false)
    }
  }

  function handleCancel() {
    setUgxPerUsd(route.rateUgxPerUsd ?? "")
    setRmbPerUsd(route.rateRmbPerUsd ?? "")
    setEditing(false)
  }

  if (!editing) {
    const parts = [
      route.rateUgxPerUsd ? `UGX ${route.rateUgxPerUsd}/USD` : null,
      route.rateRmbPerUsd ? `RMB ${route.rateRmbPerUsd}/USD` : null,
    ].filter(Boolean)
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4">
        <div>
          <p className="text-sm font-medium">Trip Rates</p>
          <p className="text-muted-foreground text-xs">
            {parts.length > 0
              ? parts.join(" | ")
              : "No trip rates set. New items will need rates entered manually."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
      <p className="text-sm font-medium">Trip Rates</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel>UGX per 1 USD</FieldLabel>
          <RateInput
            label="UGX/USD"
            value={ugxPerUsd}
            onChange={setUgxPerUsd}
            decimals={2}
            placeholder="e.g. 3750"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel>RMB per 1 USD</FieldLabel>
          <RateInput
            label="RMB/USD"
            value={rmbPerUsd}
            onChange={setRmbPerUsd}
            decimals={6}
            placeholder="e.g. 7.25"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => { void handleSave() }} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
