import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { Badge } from "#/components/ui/badge"
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

export const Route = createFileRoute("/supply/")({
  loader: async () => {
    const [routes, suppliers] = await Promise.all([
      listSupplyRoutes(),
      listSuppliersForSelect(),
    ])
    return { routes, suppliers }
  },
  component: SupplyRoutesPage,
})

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "outline",
  purchasing: "secondary",
  in_transit: "default",
  received: "default",
  completed: "secondary",
}

function SupplyRoutesPage() {
  const { routes, suppliers } = Route.useLoaderData()
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
            <CreateRouteForm
              suppliers={suppliers}
              onSuccess={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

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
                      {totalCost.toFormat(0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {totalExpenses.toFormat(0)}
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
    </div>
  )
}

function CreateRouteForm({
  suppliers,
  onSuccess,
}: {
  suppliers: Array<{ id: string; name: string; type: string }>
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([])
  const [budgetUsd, setBudgetUsd] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string).trim()

    const errs: Record<string, string> = {}
    if (!name) errs.name = "Route name is required"
    if (budgetUsd && isNaN(Number(budgetUsd))) errs.budget = "Invalid budget amount"
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
          notes: (form.get("notes") as string) || undefined,
          supplierIds: selectedSuppliers.length
            ? selectedSuppliers
            : undefined,
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
        <Label htmlFor="name">Route Name *</Label>
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
          <Label htmlFor="departureDate">Departure Date</Label>
          <Input id="departureDate" name="departureDate" type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="returnDate">Return Date</Label>
          <Input id="returnDate" name="returnDate" type="date" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="budgetUsd">Budget</Label>
        <MoneyInput
          currency="USD"
          value={budgetUsd}
          onChange={setBudgetUsd}
          decimals={2}
          placeholder="0.00"
          error={formErrors.budget}
        />
      </div>

      {suppliers.length > 0 && (
        <div className="space-y-2">
          <Label>Suppliers</Label>
          <div className="grid grid-cols-2 gap-2">
            {suppliers.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded border p-2 text-sm cursor-pointer hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedSuppliers.includes(s.id)}
                  onChange={(e) => {
                    setSelectedSuppliers((prev) =>
                      e.target.checked
                        ? [...prev, s.id]
                        : prev.filter((id) => id !== s.id),
                    )
                  }}
                />
                {s.name}
                <Badge variant="outline" className="ml-auto text-xs">
                  {s.type}
                </Badge>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating..." : "Create Route"}
      </Button>
    </form>
  )
}
