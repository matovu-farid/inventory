import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { requireUiPermission } from '#/lib/permissions'
import BigNumber from 'bignumber.js'
import { Button } from '#/components/ui/button'
import { MoneyInput } from '#/components/ui/money-input'
import { FieldLabel } from '#/components/ui/field-label'
import { InfoPopover } from '#/components/ui/info-popover'
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
import { Plus, Trash2 } from 'lucide-react'
import {
  getSupplyRoute,
  listSuppliersForSelect,
  updateSupplyRoute,
} from '#/server/functions/supply/routes'
import { deleteSupplyRouteExpense } from '#/server/functions/supply/expenses'
import { ReceiptSection } from '#/components/supply/receipt-section'
import { AddExpenseForm } from '#/components/supply/add-expense-form'
import { convertExpenseToUgx } from '#/lib/currency/expense-conversion'
import { getDistinctRouteSuppliers } from '#/lib/supply-route-suppliers'
import { roundUgxFloor50, formatUgxTotal } from '#/lib/format'

export const Route = createFileRoute('/supply/$routeId')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: async ({ params }) => {
    const [route, suppliers] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      listSuppliersForSelect(),
    ])
    return { route, suppliers }
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
  const { route, suppliers } = Route.useLoaderData()
  const router = useRouter()
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [expenseError, setExpenseError] = useState('')
  const [draftReceiptKeys, setDraftReceiptKeys] = useState<string[]>([])

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

  const routeSuppliers = getDistinctRouteSuppliers(route.items)

  return (
    <div className="space-y-6">
      {/* Header - outside PagePrerequisites */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{route.name}</h1>
          <p className="text-muted-foreground text-sm">
            {routeSuppliers.map((supplier) => supplier.name).join(', ') ||
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

      <TripRatesSection route={route} />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Item Costs
              <InfoPopover term="kpi.itemCosts" />
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
              <InfoPopover term="kpi.expenses" />
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
              <InfoPopover term="kpi.grandTotal" />
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
          <div>
            <h2 className="text-lg font-semibold">Receipts</h2>
            <p className="text-sm text-muted-foreground">
              Each receipt has one supplier and keeps its lines together.
            </p>
          </div>
          {route.status === 'open' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDraftReceiptKeys((keys) => [
                  ...keys,
                  `new-receipt-${crypto.randomUUID()}`,
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Add receipt
            </Button>
          )}
        </div>
        {route.receipts.length === 0 && draftReceiptKeys.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No receipts added yet. Use Add receipt to enter one.
          </p>
        ) : (
          <>
            {route.receipts.map((receipt) => (
              <ReceiptSection
                key={receipt.id}
                supplyRouteId={route.id}
                routeRates={{
                  ugxPerUsd: route.rateUgxPerUsd,
                  rmbPerUsd: route.rateRmbPerUsd,
                }}
                suppliers={suppliers}
                receipt={receipt}
                disabled={route.status !== 'open'}
                onChanged={() => router.invalidate()}
              />
            ))}
            {draftReceiptKeys.map((key) => (
              <ReceiptSection
                key={key}
                supplyRouteId={route.id}
                routeRates={{
                  ugxPerUsd: route.rateUgxPerUsd,
                  rmbPerUsd: route.rateRmbPerUsd,
                }}
                suppliers={suppliers}
                disabled={route.status !== 'open'}
                onChanged={async () => {
                  setDraftReceiptKeys((keys) =>
                    keys.filter((entry) => entry !== key),
                  )
                  await router.invalidate()
                }}
              />
            ))}
          </>
        )}
      </div>

      <Separator />

      {/* Expenses Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Expenses</h2>
          <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
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
