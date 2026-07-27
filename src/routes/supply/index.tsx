import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { requireUiPermission } from '#/lib/permissions'
import { useState } from 'react'
import BigNumber from 'bignumber.js'
import { roundUgxBankers50 } from '#/lib/format'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput, RateInput } from '#/components/ui/money-input'
import { FieldLabel } from '#/components/ui/field-label'
import { Textarea } from '#/components/ui/textarea'
import { Badge } from '#/components/ui/badge'
import { DatePicker } from '#/components/ui/date-picker'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { DialogTrigger } from '#/components/ui/dialog'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { Plus, ArrowRight } from 'lucide-react'
import {
  listSupplyRoutes,
  createSupplyRoute,
  listSuppliersForSelect,
} from '#/server/functions/supply/routes'
import { PagePrerequisites } from '#/components/prerequisites/page-prerequisites'
import { getSupplyPrereqs } from '#/server/functions/prereqs/supply'

export const Route = createFileRoute('/supply/')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: async () => {
    const [routes, suppliers, prerequisites] = await Promise.all([
      listSupplyRoutes(),
      listSuppliersForSelect(),
      getSupplyPrereqs(),
    ])
    return { routes, suppliers, prerequisites }
  },
  component: SupplyRoutesPage,
})

const STATUS_COLORS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  planning: 'outline',
  in_transit: 'default',
  received: 'secondary',
}

function SupplyRoutesPage() {
  const { routes, prerequisites } = Route.useLoaderData()
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Supply Routes</h1>
          <p className="text-muted-foreground">
            Manage buying trips and procurement routes.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Route
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Supply Route</DialogTitle>
            </DialogHeader>
            <CreateRouteForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

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
                <Badge variant={STATUS_COLORS[r.status] ?? 'outline'}>
                  {r.status.replace('_', ' ')}
                </Badge>
              ),
            },
            {
              header: 'Suppliers',
              cell: (r) =>
                r.suppliers.map((s) => s.supplier.name).join(', ') || '-',
              hideOnMobile: true,
            },
            {
              header: 'Items',
              align: 'right',
              cell: (r) => r.items.length,
            },
            {
              header: 'Total Cost (UGX)',
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
                  {roundUgxBankers50(
                    r.expenses.reduce(
                      (sum, e) => sum.plus(e.amount),
                      new BigNumber(0),
                    ),
                  ).toFormat(0)}
                </span>
              ),
            },
            {
              header: '',
              cell: (r) => (
                <Link
                  to="/supply/$routeId"
                  params={{ routeId: r.id }}
                  className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                >
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              ),
            },
          ]}
        />
      </PagePrerequisites>
    </div>
  )
}

function CreateRouteForm({ onSuccess }: { onSuccess: () => void }) {
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
      await createSupplyRoute({
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
      onSuccess()
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
            <RateInput
              label="UGX/USD"
              value={rateUgxPerUsd}
              onChange={setRateUgxPerUsd}
              decimals={2}
              placeholder="e.g. 3750"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>RMB per 1 USD</FieldLabel>
            <RateInput
              label="RMB/USD"
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
