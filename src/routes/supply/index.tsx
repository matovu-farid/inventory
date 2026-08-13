import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUiPermission } from '#/lib/permissions'
import { useState } from 'react'
import BigNumber from 'bignumber.js'
import { roundUgxBankers50 } from '#/lib/format'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { FieldLabel } from '#/components/ui/field-label'
import { Textarea } from '#/components/ui/textarea'
import { Badge } from '#/components/ui/badge'
import { DatePicker } from '#/components/ui/date-picker'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { Card, CardContent } from '#/components/ui/card'
import { Plus, ArrowRight, CheckCircle2 } from 'lucide-react'
import {
  listSupplyRoutes,
  createSupplyRoute,
} from '#/server/functions/supply/routes'
import { PagePrerequisites } from '#/components/prerequisites/page-prerequisites'
import { getSupplyPrereqs } from '#/server/functions/prereqs/supply'
import { convertExpenseToUgx } from '#/lib/currency/expense-conversion'

export const Route = createFileRoute('/supply/')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  validateSearch: z.object({ completedRoute: z.uuid().optional() }),
  loader: async () => {
    const [routes, prerequisites] = await Promise.all([
      listSupplyRoutes(),
      getSupplyPrereqs(),
    ])
    return { routes, prerequisites }
  },
  component: SupplyRoutesPage,
})

const STATUS_COLORS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  open: 'outline',
  partially_received: 'default',
  received: 'secondary',
}

function SupplyRoutesPage() {
  const { routes, prerequisites } = Route.useLoaderData()
  const { completedRoute } = Route.useSearch()
  const recentOpenRoute = routes.find((route) => route.status === 'open')
  const completed = completedRoute
    ? routes.find((route) => route.id === completedRoute)
    : undefined

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supply Routes</h1>
          <p className="text-muted-foreground">
            Manage buying trips and procurement routes.
          </p>
        </div>
        <Link to="/supply/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Route
          </Button>
        </Link>
      </div>

      {completed && (
        <Card role="status" aria-live="polite" className="border-primary/40">
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Supply route saved</p>
                <p className="text-sm text-muted-foreground">
                  {completed.name} is open and ready to continue.{' '}
                  {completed.items.length} item row
                  {completed.items.length === 1 ? '' : 's'} saved.
                </p>
              </div>
            </div>
            <Link
              to="/supply/$routeId/entry"
              params={{ routeId: completed.id }}
            >
              <Button variant="outline" size="sm">
                Open route
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {recentOpenRoute && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Continue your most recent open route</p>
            <p className="text-sm text-muted-foreground">
              {recentOpenRoute.name} · {recentOpenRoute.items.length} item rows
            </p>
          </div>
          <Link
            to="/supply/$routeId/entry"
            params={{ routeId: recentOpenRoute.id }}
          >
            <Button>Continue route</Button>
          </Link>
        </div>
      )}

      <PagePrerequisites result={prerequisites}>
        <ResponsiveTable
          data={routes}
          getRowKey={(r) => r.id}
          emptyMessage="No supply routes yet. Create your first route to start tracking procurement."
          columns={[
            {
              header: 'Route',
              cell: (r) => (
                <div>
                  <span className="font-medium">{r.name}</span>
                  {r.departureDate && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {r.departureDate}
                    </span>
                  )}
                </div>
              ),
            },
            {
              header: 'Status',
              cell: (r) => (
                <Badge variant={STATUS_COLORS[r.displayStatus] ?? 'outline'}>
                  {r.displayStatus.replace('_', ' ')}
                </Badge>
              ),
            },
            {
              header: 'Suppliers',
              cell: (r) =>
                Array.from(
                  new Set(r.suppliers.map((entry) => entry.supplier.name)),
                ).join(', ') || '-',
              hideOnMobile: true,
            },
            {
              header: 'Items',
              align: 'right',
              cell: (r) => r.items.length,
            },
            {
              header: 'Item Cost (UGX)',
              align: 'right',
              cell: (r) => (
                <span className="font-mono">
                  {roundUgxBankers50(
                    r.items.reduce(
                      (sum, i) => sum.plus(i.totalCostUgx),
                      new BigNumber(0),
                    ),
                  ).toFormat(0)}
                </span>
              ),
            },
            {
              header: 'Expenses (UGX)',
              align: 'right',
              hideOnMobile: true,
              cell: (r) => (
                <span className="font-mono">
                  {(() => {
                    const converted = r.expenses.reduce((sum, expense) => {
                      try {
                        return sum.plus(
                          convertExpenseToUgx({
                            amount: expense.amount,
                            currency: expense.currency ?? 'UGX',
                            exchangeRate: expense.exchangeRate ?? undefined,
                          }),
                        )
                      } catch {
                        return sum
                      }
                    }, new BigNumber(0))
                    const missing = r.expenses.some((expense) => {
                      try {
                        convertExpenseToUgx({
                          amount: expense.amount,
                          currency: expense.currency ?? 'UGX',
                          exchangeRate: expense.exchangeRate ?? undefined,
                        })
                        return false
                      } catch {
                        return true
                      }
                    })
                    return missing
                      ? `${roundUgxBankers50(converted).toFormat(0)} + needs rate`
                      : roundUgxBankers50(converted).toFormat(0)
                  })()}
                </span>
              ),
            },
            {
              header: '',
              cell: (r) => (
                <Link
                  to={
                    r.status === 'open'
                      ? '/supply/$routeId/entry'
                      : '/supply/$routeId'
                  }
                  params={{ routeId: r.id }}
                  className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                >
                  {r.status === 'open' ? 'Continue setup' : 'View'}{' '}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ),
            },
          ]}
        />
      </PagePrerequisites>
    </div>
  )
}

export function CreateRouteForm({
  onSuccess,
}: {
  onSuccess: (routeId: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [budgetUsd, setBudgetUsd] = useState('')
  const [rateUgxPerUsd, setRateUgxPerUsd] = useState('')
  const [rateRmbPerUsd, setRateRmbPerUsd] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get('name') as string).trim()

    const departureDate = (form.get('departureDate') as string) || ''
    const returnDate = (form.get('returnDate') as string) || ''

    const errs: Record<string, string> = {}
    if (!name) errs.name = 'Route name is required'
    if (budgetUsd && isNaN(Number(budgetUsd)))
      errs.budget = 'Invalid budget amount'
    if (departureDate && returnDate && departureDate > returnDate) {
      errs.returnDate = 'Return date must be on or after departure date'
    }
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPending(true)
    try {
      const route = await createSupplyRoute({
        data: {
          name,
          departureDate: (form.get('departureDate') as string) || undefined,
          returnDate: (form.get('returnDate') as string) || undefined,
          budgetUsd: budgetUsd || undefined,
          rateUgxPerUsd: rateUgxPerUsd || undefined,
          rateRmbPerUsd: rateRmbPerUsd || undefined,
          notes: (form.get('notes') as string) || undefined,
        },
      })
      void router.invalidate()
      onSuccess(route.id)
    } catch (err) {
      console.error('Failed to create route:', err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e)
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <FieldLabel htmlFor="name" help="supplyRoute.name">
          Route Name *
        </FieldLabel>
        <Input
          id="name"
          name="name"
          placeholder='e.g., "47th Route" or "Jan 2026"'
          required
          aria-invalid={!!formErrors.name || undefined}
        />
        {formErrors.name && (
          <p className="text-xs text-destructive">{formErrors.name}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <FieldLabel htmlFor="departureDate" help="supplyRoute.departureDate">
            Departure Date
          </FieldLabel>
          <DatePicker id="departureDate" name="departureDate" />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="returnDate" help="supplyRoute.returnDate">
            Return Date
          </FieldLabel>
          <DatePicker id="returnDate" name="returnDate" />
          {formErrors.returnDate && (
            <p className="text-xs text-destructive">{formErrors.returnDate}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="budgetUsd" help="supplyRoute.budgetUsd">
          Budget
        </FieldLabel>
        <MoneyInput
          id="budgetUsd"
          currency="USD"
          decimals={2}
          value={budgetUsd}
          onChange={setBudgetUsd}
          placeholder="0"
          error={formErrors.budget}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Trip Exchange Rates</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel>UGX per 1 USD</FieldLabel>
            <MoneyInput
              currency="UGX/USD"
              value={rateUgxPerUsd}
              onChange={setRateUgxPerUsd}
              decimals={0}
              placeholder="e.g. 3750"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>RMB per 1 USD</FieldLabel>
            <MoneyInput
              currency="RMB/USD"
              value={rateRmbPerUsd}
              onChange={setRateRmbPerUsd}
              decimals={6}
              placeholder="e.g. 7.25"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="notes" help="supplyRoute.notes">
          Notes
        </FieldLabel>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating...' : 'Create Route'}
      </Button>
    </form>
  )
}
