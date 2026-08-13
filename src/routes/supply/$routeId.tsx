import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { useState } from 'react'
import { requireUiPermission } from '#/lib/permissions'
import BigNumber from 'bignumber.js'
import { Button } from '#/components/ui/button'
import { MoneyInput } from '#/components/ui/money-input'
import { FieldLabel } from '#/components/ui/field-label'
import { InfoTip } from '#/components/ui/info-tip'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Separator } from '#/components/ui/separator'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { DialogTrigger } from '#/components/ui/dialog'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  Plus,
  Trash2,
  Split,
  ChevronDown,
  ChevronRight,
  Pencil,
} from 'lucide-react'
import {
  getSupplyRoute,
  updateSupplyRoute,
} from '#/server/functions/supply/routes'
import {
  deleteSupplyRouteItem,
  updateSupplyRouteLineQuantity,
} from '#/server/functions/supply/items'
import { SplitItemForm } from '#/components/supply/split-item-form'
import { listItemCategories } from '#/server/functions/items/items'
import { deleteSupplyRouteExpense } from '#/server/functions/supply/expenses'
import { PagePrerequisites } from '#/components/prerequisites/page-prerequisites'
import { AddItemForm as ExtractedAddItemForm } from '#/components/supply/add-item-form'
import { AddExpenseForm } from '#/components/supply/add-expense-form'
import { getSupplyRouteDetailPrereqs } from '#/server/functions/prereqs/supply'
import { convertExpenseToUgx } from '#/lib/currency/expense-conversion'
import {
  roundUgxFloor50,
  roundUgxBankers50,
  formatUgxTotal,
} from '#/lib/format'

export const Route = createFileRoute('/supply/$routeId')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: async ({ params }) => {
    const [route, prerequisites, categories] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      getSupplyRouteDetailPrereqs(),
      listItemCategories(),
    ])
    return { route, prerequisites, categories }
  },
  component: RouteDetailPage,
})

function expenseAmountUgx(exp: {
  amount: string
  currency?: string | null
  exchangeRate?: string | null
}): BigNumber | null {
  const currency = exp.currency ?? 'UGX'
  try {
    return new BigNumber(
      convertExpenseToUgx({
        amount: exp.amount,
        currency,
        exchangeRate: exp.exchangeRate ?? undefined,
      }),
    )
  } catch {
    return null
  }
}

function RouteDetailPage() {
  const { route, prerequisites, categories } = Route.useLoaderData()
  const router = useRouter()
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [expenseError, setExpenseError] = useState('')
  const [splittingItemId, setSplittingItemId] = useState<string | null>(null)
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    new Set(),
  )
  const splittingItem =
    route.items.find((i) => i.id === splittingItemId) ?? null

  type RouteItem = (typeof route.items)[number]
  const groupedItems = React.useMemo(() => {
    const groups = new Map<
      string,
      { name: string; articleNumber: string; items: RouteItem[] }
    >()
    for (const line of route.items) {
      const catalog = line.itemColor?.item ?? line.item
      if (!catalog) continue
      const key = catalog.articleNumber
      let group = groups.get(key)
      if (!group) {
        group = { name: catalog.name, articleNumber: key, items: [] }
        groups.set(key, group)
      }
      group.items.push(line)
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
  const totalExpenses = route.expenses.reduce((sum, e) => {
    const converted = expenseAmountUgx(e)
    return converted ? sum.plus(converted) : sum
  }, new BigNumber(0))
  const unconvertedExpenseCount = route.expenses.filter(
    (expense) => expenseAmountUgx(expense) === null,
  ).length
  const grandTotal = totalItemCost.plus(totalExpenses)

  async function handleDeleteItem(id: string) {
    await deleteSupplyRouteItem({ data: { id } })
    void router.invalidate()
  }

  async function handleEditQuantity(item: RouteItem) {
    if (route.status !== 'open') return
    const raw = window.prompt('New quantity', String(item.quantity))
    if (raw === null) return
    const quantity = Number(raw)
    if (!Number.isInteger(quantity) || quantity <= 0) return
    await updateSupplyRouteLineQuantity({ data: { id: item.id, quantity } })
    void router.invalidate()
  }

  async function handleDeleteExpense(id: string) {
    if (route.status !== 'open') return
    if (!window.confirm('Remove this expense?')) return
    try {
      await deleteSupplyRouteExpense({ data: { id } })
      setExpenseError('')
      await router.invalidate()
    } catch (cause) {
      setExpenseError(
        cause instanceof Error ? cause.message : 'Could not remove expense',
      )
    }
  }

  if (router.state.location.pathname.endsWith('/entry')) {
    return <Outlet />
  }

  // Build supplier lookup for items form

  return (
    <div className="space-y-6">
      {/* Header - outside PagePrerequisites */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{route.name}</h1>
          <p className="text-muted-foreground text-sm">
            {route.suppliers.map((s) => s.supplier.name).join(', ') ||
              'No suppliers linked'}
            {route.departureDate && ` | Departed: ${route.departureDate}`}
            {route.returnDate && ` | Returned: ${route.returnDate}`}
          </p>
        </div>
        <Badge
          variant={route.displayStatus === 'received' ? 'secondary' : 'outline'}
        >
          {route.displayStatus === 'partially_received'
            ? 'Partially received'
            : route.displayStatus === 'received'
              ? 'Received'
              : 'Open'}
        </Badge>
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
              {unconvertedExpenseCount > 0 && (
                <p className="mt-1 text-xs text-destructive">
                  {unconvertedExpenseCount} needs a conversion rate
                </p>
              )}
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
                <Button size="sm" disabled={route.status !== 'open'}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Add Item</DialogTitle>
                </DialogHeader>
                <ExtractedAddItemForm
                  supplyRouteId={route.id}
                  rateUgxPerUsd={route.rateUgxPerUsd}
                  rateRmbPerUsd={route.rateRmbPerUsd}
                  categories={categories}
                  suppliers={route.suppliers.map((entry) => ({
                    id: entry.supplier.id,
                    name: entry.supplier.name,
                  }))}
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
                        i.totalAmountUsd ? s.plus(i.totalAmountUsd) : s,
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
                            {group.items.length === 1 ? '' : 's'}
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
                            {totalUsd.gt(0) ? totalUsd.toFormat(2) : '-'}
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
                                {item.itemColor ? (
                                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                    <span
                                      className="inline-block size-3 rounded-full border"
                                      style={{
                                        backgroundColor:
                                          item.itemColor.colorHex,
                                      }}
                                      aria-hidden
                                    />
                                    {item.itemColor.colorName}
                                    {item.size ? ` · ${item.size}` : ''}
                                  </span>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
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
                                )}{' '}
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
                                  : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {roundUgxBankers50(item.totalCostUgx).toFormat(
                                  0,
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  {route.status === 'open' &&
                                    !item.received &&
                                    (!item.itemColor || !item.size) && (
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
                                  {route.status === 'open' &&
                                    !item.received && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        title="Edit quantity"
                                        onClick={() =>
                                          void handleEditQuantity(item)
                                        }
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                  {route.status === 'open' &&
                                    !item.received && (
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
                                    )}
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
                <Button size="sm" disabled={route.status !== 'open'}>
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
                  rateRmbPerUsd={route.rateRmbPerUsd}
                  onSuccess={() => {
                    setExpenseDialogOpen(false)
                    void router.invalidate()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {expenseError && (
            <p role="alert" className="text-sm text-destructive">
              {expenseError}
            </p>
          )}

          <ResponsiveTable
            data={route.expenses}
            getRowKey={(exp) => exp.id}
            emptyMessage="No expenses recorded yet."
            columns={[
              {
                header: 'Category',
                cell: (exp) => <Badge variant="outline">{exp.category}</Badge>,
              },
              {
                header: 'Description',
                cell: (exp) => exp.description || '-',
              },
              {
                header: 'Amount',
                align: 'right',
                hideOnMobile: true,
                cell: (exp) => (
                  <span className="font-mono">
                    {exp.currency === 'UGX'
                      ? roundUgxFloor50(exp.amount).toFormat(0)
                      : new BigNumber(exp.amount).toFormat(2)}{' '}
                    <span className="text-muted-foreground text-xs">
                      {exp.currency ?? 'UGX'}
                    </span>
                  </span>
                ),
              },
              {
                header: 'Rate',
                align: 'right',
                hideOnMobile: true,
                cell: (exp) =>
                  exp.currency && exp.currency !== 'UGX' && exp.exchangeRate ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {new BigNumber(exp.exchangeRate).toFormat(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  ),
              },
              {
                header: 'Total (UGX)',
                align: 'right',
                cell: (exp) => (
                  <span className="font-mono font-semibold">
                    {expenseAmountUgx(exp)
                      ? roundUgxFloor50(
                          expenseAmountUgx(exp)?.toString() ?? '0',
                        ).toFormat(0)
                      : 'Conversion needed'}
                  </span>
                ),
              },
              {
                header: '',
                cell: (exp) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    disabled={route.status !== 'open'}
                    aria-label="Remove expense"
                    onClick={() => {
                      void handleDeleteExpense(exp.id)
                    }}
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
/* Trip Rates Section                                                  */
/* ------------------------------------------------------------------ */

function TripRatesSection({
  route,
}: {
  route: {
    id: string
    status: 'open' | 'received'
    rateUgxPerUsd: string | null
    rateRmbPerUsd: string | null
  }
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [ugxPerUsd, setUgxPerUsd] = useState(route.rateUgxPerUsd ?? '')
  const [rmbPerUsd, setRmbPerUsd] = useState(route.rateRmbPerUsd ?? '')

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
      console.error('Failed to update trip rates:', err)
    } finally {
      setPending(false)
    }
  }

  function handleCancel() {
    setUgxPerUsd(route.rateUgxPerUsd ?? '')
    setRmbPerUsd(route.rateRmbPerUsd ?? '')
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
              ? parts.join(' | ')
              : 'No trip rates set. New items will need rates entered manually.'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={route.status !== 'open'}
          onClick={() => setEditing(true)}
        >
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
          <MoneyInput
            currency="UGX/USD"
            value={ugxPerUsd}
            disabled={route.status !== 'open' || pending}
            onChange={setUgxPerUsd}
            decimals={0}
            placeholder="e.g. 3750"
          />
        </div>
        <div className="space-y-2">
          <FieldLabel>RMB per 1 USD</FieldLabel>
          <MoneyInput
            currency="RMB/USD"
            value={rmbPerUsd}
            disabled={route.status !== 'open' || pending}
            onChange={setRmbPerUsd}
            decimals={6}
            placeholder="e.g. 7.25"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => {
            void handleSave()
          }}
          disabled={pending}
        >
          {pending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
