import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Separator } from "#/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
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
import { Plus, Trash2 } from "lucide-react"
import {
  getSupplyRoute,
  updateSupplyRoute,
  listSuppliersForSelect,
} from "#/server/functions/supply/routes"
import {
  addSupplyRouteItem,
  deleteSupplyRouteItem,
} from "#/server/functions/supply/items"
import {
  addSupplyRouteExpense,
  deleteSupplyRouteExpense,
} from "#/server/functions/supply/expenses"

export const Route = createFileRoute("/supply/$routeId")({
  loader: async ({ params }) => {
    const [route, suppliers] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      listSuppliersForSelect(),
    ])
    return { route, suppliers }
  },
  component: RouteDetailPage,
})

const STATUSES = [
  "planning",
  "purchasing",
  "in_transit",
  "received",
  "completed",
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

function RouteDetailPage() {
  const { route, suppliers } = Route.useLoaderData()
  const router = useRouter()
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)

  const totalItemCost = route.items.reduce(
    (sum, i) => sum.plus(i.totalCostUgx),
    new BigNumber(0),
  )
  const totalExpenses = route.expenses.reduce(
    (sum, e) => sum.plus(e.amount),
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
    router.invalidate()
  }

  async function handleDeleteItem(id: string) {
    await deleteSupplyRouteItem({ data: { id } })
    router.invalidate()
  }

  async function handleDeleteExpense(id: string) {
    await deleteSupplyRouteExpense({ data: { id } })
    router.invalidate()
  }

  // Build supplier lookup for items form
  const routeSupplierIds = route.suppliers.map((s) => s.supplier.id)
  const routeSuppliers = suppliers.filter((s) =>
    routeSupplierIds.includes(s.id),
  )

  return (
    <div className="space-y-6">
      {/* Header */}
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
        <Select value={route.status} onValueChange={handleStatusChange}>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Item Costs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {totalItemCost.toFormat(0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {route.items.length} items
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {totalExpenses.toFormat(0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {route.expenses.length} entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Grand Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {grandTotal.toFormat(0)}
            </div>
            <p className="text-xs text-muted-foreground">UGX</p>
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
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Add Item</DialogTitle>
              </DialogHeader>
              <AddItemForm
                supplyRouteId={route.id}
                suppliers={
                  routeSuppliers.length > 0 ? routeSuppliers : suppliers
                }
                onSuccess={() => {
                  setItemDialogOpen(false)
                  router.invalidate()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {route.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No items added yet.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Art #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total (Foreign)</TableHead>
                  <TableHead className="text-right">Total (USD)</TableHead>
                  <TableHead className="text-right">Total (UGX)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {route.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.articleNumber || "-"}
                    </TableCell>
                    <TableCell>{item.supplier.name}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">
                      {new BigNumber(item.unitPriceForeign).toFormat(2)}{" "}
                      <span className="text-muted-foreground text-xs">
                        {item.foreignCurrency}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {new BigNumber(item.totalAmountForeign).toFormat(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.totalAmountUsd
                        ? new BigNumber(item.totalAmountUsd).toFormat(2)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {new BigNumber(item.totalCostUgx).toFormat(0)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

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
                onSuccess={() => {
                  setExpenseDialogOpen(false)
                  router.invalidate()
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {route.expenses.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No expenses recorded yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount (UGX)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {route.expenses.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell>
                      <Badge variant="outline">{exp.category}</Badge>
                    </TableCell>
                    <TableCell>{exp.description || "-"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {new BigNumber(exp.amount).toFormat(0)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteExpense(exp.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Add Item Form                                                       */
/* ------------------------------------------------------------------ */

function AddItemForm({
  supplyRouteId,
  suppliers,
  onSuccess,
}: {
  supplyRouteId: string
  suppliers: Array<{ id: string; name: string }>
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [currency, setCurrency] = useState("RMB")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)

    const form = new FormData(e.currentTarget)
    try {
      await addSupplyRouteItem({
        data: {
          supplyRouteId,
          supplierId: form.get("supplierId") as string,
          productName: form.get("productName") as string,
          articleNumber: (form.get("articleNumber") as string) || undefined,
          quantity: Number(form.get("quantity")),
          unitPriceForeign: form.get("unitPriceForeign") as string,
          foreignCurrency: currency,
          exchangeRateForeignToUsd:
            currency !== "UGX"
              ? (form.get("exchangeRateForeignToUsd") as string) || undefined
              : undefined,
          exchangeRateUsdToUgx:
            currency !== "UGX"
              ? (form.get("exchangeRateUsdToUgx") as string) || undefined
              : undefined,
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to add item:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="productName">Product Name *</Label>
          <Input id="productName" name="productName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="articleNumber">Article #</Label>
          <Input id="articleNumber" name="articleNumber" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplierId">Supplier *</Label>
        <Select name="supplierId" required>
          <SelectTrigger>
            <SelectValue placeholder="Select supplier" />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity *</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min="1"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unitPriceForeign">Unit Price *</Label>
          <Input
            id="unitPriceForeign"
            name="unitPriceForeign"
            type="number"
            step="0.01"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RMB">RMB</SelectItem>
              <SelectItem value="BHT">BHT</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="UGX">UGX</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {currency !== "UGX" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="exchangeRateForeignToUsd">
              {currency}/USD Rate *
            </Label>
            <Input
              id="exchangeRateForeignToUsd"
              name="exchangeRateForeignToUsd"
              type="number"
              step="0.000001"
              placeholder={`How many ${currency} per 1 USD`}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exchangeRateUsdToUgx">USD/UGX Rate *</Label>
            <Input
              id="exchangeRateUsdToUgx"
              name="exchangeRateUsdToUgx"
              type="number"
              step="0.01"
              placeholder="UGX per 1 USD"
              required
            />
          </div>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding..." : "Add Item"}
      </Button>
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Add Expense Form                                                    */
/* ------------------------------------------------------------------ */

function AddExpenseForm({
  supplyRouteId,
  onSuccess,
}: {
  supplyRouteId: string
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)

    const form = new FormData(e.currentTarget)
    try {
      await addSupplyRouteExpense({
        data: {
          supplyRouteId,
          category: form.get("category") as (typeof EXPENSE_CATEGORIES)[number],
          description: (form.get("description") as string) || undefined,
          amount: form.get("amount") as string,
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to add expense:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="category">Category *</Label>
        <Select name="category" required>
          <SelectTrigger>
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Amount (UGX) *</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="1"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Adding..." : "Add Expense"}
      </Button>
    </form>
  )
}
