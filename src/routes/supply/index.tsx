import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import { useState } from "react"
import BigNumber from "bignumber.js"
import { roundUgxBankers50 } from "#/lib/format"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput, RateInput } from "#/components/ui/money-input"
import { FieldLabel } from "#/components/ui/field-label"
import { Textarea } from "#/components/ui/textarea"
import { Badge } from "#/components/ui/badge"
import { DatePicker } from "#/components/ui/date-picker"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Plus, ArrowRight } from "lucide-react"
import {
  listSupplyRoutes,
  createSupplyRoute,
  listSuppliersForSelect,
} from "#/server/functions/supply/routes"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { getSupplyPrereqs } from "#/server/functions/prereqs/supply"

export const Route = createFileRoute("/supply/")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "procurement.view"),
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

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "outline",
  in_transit: "default",
  received: "secondary",
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

        {routes.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">
            No supply routes yet. Create your first route to start tracking
            procurement.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Suppliers</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total Cost (UGX)</TableHead>
                  <TableHead className="text-right">Expenses (UGX)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r) => {
                  const totalCost = r.items.reduce(
                    (sum, i) => sum.plus(i.totalCostUgx),
                    new BigNumber(0),
                  )
                  const totalExpenses = r.expenses.reduce(
                    (sum, e) => sum.plus(e.amount),
                    new BigNumber(0),
                  )
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{r.name}</span>
                          {r.departureDate && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {r.departureDate}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[r.status] ?? "outline"}>
                          {r.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.suppliers
                          .map((s) => s.supplier.name)
                          .join(", ") || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.items.length}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {roundUgxBankers50(totalCost).toFormat(0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {roundUgxBankers50(totalExpenses).toFormat(0)}
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/supply/$routeId"
                          params={{ routeId: r.id }}
                          className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          View <ArrowRight className="h-3 w-3" />
                        </Link>
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

function CreateRouteForm({
  onSuccess,
}: {
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [budgetUsd, setBudgetUsd] = useState("")
  const [rateUgxPerUsd, setRateUgxPerUsd] = useState("")
  const [rateRmbPerUsd, setRateRmbPerUsd] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string).trim()

    const departureDate = (form.get("departureDate") as string) || ""
    const returnDate = (form.get("returnDate") as string) || ""

    const errs: Record<string, string> = {}
    if (!name) errs.name = "Route name is required"
    if (budgetUsd && isNaN(Number(budgetUsd))) errs.budget = "Invalid budget amount"
    if (departureDate && returnDate && departureDate > returnDate) {
      errs.returnDate = "Return date must be on or after departure date"
    }
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPending(true)
    try {
      await createSupplyRoute({
        data: {
          name,
          departureDate: (form.get("departureDate") as string) || undefined,
          returnDate: (form.get("returnDate") as string) || undefined,
          budgetUsd: budgetUsd || undefined,
          rateUgxPerUsd: rateUgxPerUsd || undefined,
          rateRmbPerUsd: rateRmbPerUsd || undefined,
          notes: (form.get("notes") as string) || undefined,
        },
      })
      router.invalidate()
      onSuccess()
    } catch (err) {
      console.error("Failed to create route:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <FieldLabel htmlFor="name" help="supplyRoute.name">Route Name *</FieldLabel>
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
          <FieldLabel htmlFor="departureDate" help="supplyRoute.departureDate">Departure Date</FieldLabel>
          <DatePicker id="departureDate" name="departureDate" />
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="returnDate" help="supplyRoute.returnDate">Return Date</FieldLabel>
          <DatePicker id="returnDate" name="returnDate" />
          {formErrors.returnDate && (
            <p className="text-xs text-destructive">{formErrors.returnDate}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="budgetUsd" help="supplyRoute.budgetUsd">Budget</FieldLabel>
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
        <FieldLabel htmlFor="notes" help="supplyRoute.notes">Notes</FieldLabel>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Create Route"}
      </Button>
    </form>
  )
}
