import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
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
import { Plus, Trash2, ArrowRight } from "lucide-react"
import {
  getSupplyRoute,
  updateSupplyRoute,
  listSuppliersForSelect,
} from "#/server/functions/supply/routes"
import {
  addSupplyRouteVariants,
  deleteSupplyRouteItem,
} from "#/server/functions/supply/items"
import {
  ProductPicker,
  type ProductSummary,
} from "#/components/products/product-picker"
import { ProductEditor } from "#/components/products/product-editor"
import { ColorEditor } from "#/components/products/color-editor"
import { VariantGrid } from "#/components/products/variant-grid"
import { getProductByArticle } from "#/server/functions/products/products"
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

function RouteDetailPage() {
  const { route, suppliers, prerequisites } = Route.useLoaderData()
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
              <DialogContent className="max-w-xl">
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
                    router.invalidate()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          <ResponsiveTable
            data={route.items}
            getRowKey={(item) => item.id}
            emptyMessage="No items added yet."
            columns={[
              {
                header: "Product",
                cell: (item) => (
                  <span className="font-medium">
                    {item.productColor.product.name}
                  </span>
                ),
              },
              {
                header: "Article",
                hideOnMobile: true,
                cell: (item) => (
                  <span className="text-muted-foreground font-mono text-xs">
                    {item.productColor.product.articleNumber}
                    <InfoTip term="col.articleNumber" />
                  </span>
                ),
              },
              {
                header: "Color · Size",
                cell: (item) => (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="inline-block size-3 rounded-full border"
                      style={{ backgroundColor: item.productColor.colorHex }}
                      aria-hidden
                    />
                    {item.productColor.colorName} · {item.size}
                  </span>
                ),
              },
              {
                header: "Supplier",
                hideOnMobile: true,
                cell: (item) => item.supplier.name,
              },
              {
                header: "Qty",
                align: "right",
                cell: (item) => item.quantity,
              },
              {
                header: "Unit Price",
                align: "right",
                hideOnMobile: true,
                cell: (item) => (
                  <span className="font-mono">
                    {new BigNumber(item.unitPriceForeign).toFormat(2)}{" "}
                    <span className="text-muted-foreground text-xs">
                      {item.foreignCurrency}
                    </span>
                  </span>
                ),
              },
              {
                header: "Total (Foreign)",
                align: "right",
                hideOnMobile: true,
                cell: (item) => (
                  <span className="font-mono">
                    {new BigNumber(item.totalAmountForeign).toFormat(2)}
                  </span>
                ),
              },
              {
                header: "Total (USD)",
                align: "right",
                hideOnMobile: true,
                cell: (item) => (
                  <span className="font-mono">
                    {item.totalAmountUsd
                      ? new BigNumber(item.totalAmountUsd).toFormat(2)
                      : "-"}
                  </span>
                ),
              },
              {
                header: "Total (UGX)",
                align: "right",
                cell: (item) => (
                  <span className="font-mono font-semibold">
                    {roundUgxBankers50(item.totalCostUgx).toFormat(0)}
                  </span>
                ),
              },
              {
                header: "",
                cell: (item) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ),
              },
            ]}
          />
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
                header: "Amount (UGX)",
                align: "right",
                cell: (exp) => (
                  <span className="font-mono font-semibold">
                    {roundUgxFloor50(exp.amount).toFormat(0)}
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
                    onClick={() => handleDeleteExpense(exp.id)}
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
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [unitPrice, setUnitPrice] = useState("")
  const initialCurrency = "RMB"
  const initialFxToUsd =
    initialCurrency === "RMB"
      ? rateRmbPerUsd ?? ""
      : ""
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
    if (p) setProduct(p as ProductSummary)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cells = Object.entries(quantities)
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
    if (Object.keys(errs).length > 0) return

    setPending(true)
    try {
      await addSupplyRouteVariants({
        data: {
          supplyRouteId,
          supplierId,
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
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="space-y-2">
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
          <VariantGrid
            sizes={product.sizes}
            colors={product.colors}
            quantities={quantities}
            onChange={setQuantities}
          />
          {formErrors.quantities && (
            <p className="text-xs text-destructive">{formErrors.quantities}</p>
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
  onSuccess,
}: {
  supplyRouteId: string
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    const errs: Record<string, string> = {}
    if (!category) errs.category = "Select a category"
    if (!amount || Number(amount) <= 0) errs.amount = "Enter a valid amount"
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

      <div className="space-y-2">
        <FieldLabel help="expense.amount">Amount *</FieldLabel>
        <MoneyInput
          currency="UGX"
          roundTo={50}
          value={amount}
          onChange={setAmount}
          placeholder="0"
          error={formErrors.amount}
        />
      </div>

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
      router.invalidate()
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
        <Button size="sm" onClick={handleSave} disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
