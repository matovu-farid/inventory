import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import BigNumber from "bignumber.js"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { FieldLabel } from "#/components/ui/field-label"
import { InfoTip } from "#/components/ui/info-tip"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  addStoreOpeningBalance,
  addShopOpeningBalance,
} from "#/server/functions/admin/opening-balance"
import { roundUgxBankers50 } from "#/lib/format"

interface DraftRow {
  id: string
  productName: string
  articleNumber: string
  quantity: string // raw text so empty state is allowed
  costPerUnitUgx: string
}

interface SubmitSummary {
  scope: "store" | "shop"
  itemCount: number
  totalValueUgx: string
}

function newRow(): DraftRow {
  return {
    id: crypto.randomUUID(),
    productName: "",
    articleNumber: "",
    quantity: "",
    costPerUnitUgx: "",
  }
}

function parseQty(s: string): number {
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

function rowIsValid(r: DraftRow): boolean {
  if (!r.productName.trim()) return false
  const qty = parseQty(r.quantity)
  if (qty <= 0) return false
  const cost = new BigNumber(r.costPerUnitUgx || "0")
  if (!cost.isFinite() || cost.lte(0)) return false
  return true
}

function rowsTotal(rows: DraftRow[]): BigNumber {
  return rows.reduce((sum, r) => {
    if (!rowIsValid(r)) return sum
    const cost = new BigNumber(r.costPerUnitUgx || "0")
    return sum.plus(cost.times(parseQty(r.quantity)))
  }, new BigNumber(0))
}

export type OpeningBalanceShop = {
  id: string
  name: string
  location: string | null
}

interface OpeningBalanceFormProps {
  scope: "store" | "shop"
  /** Required when scope === "shop": list of shops the user can choose between. */
  shops?: OpeningBalanceShop[]
  /** Optional initial shop selection (used when arriving from Shop page with ?shopId=…). */
  initialShopId?: string
}

export function OpeningBalanceForm({
  scope,
  shops = [],
  initialShopId,
}: OpeningBalanceFormProps) {
  const router = useRouter()
  const [rows, setRows] = useState<DraftRow[]>([newRow()])
  const [shopId, setShopId] = useState<string>(
    initialShopId ?? shops[0]?.id ?? "",
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SubmitSummary | null>(null)

  const total = rowsTotal(rows)
  const validCount = rows.filter(rowIsValid).length
  const allRowsValid = rows.length > 0 && rows.every(rowIsValid)
  const canSubmit =
    allRowsValid && (scope === "store" || (scope === "shop" && !!shopId))

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)))
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()])
  }

  async function performSubmit() {
    setPending(true)
    setError(null)
    try {
      const items = rows.map((r) => ({
        productName: r.productName.trim(),
        articleNumber: r.articleNumber.trim() || undefined,
        quantity: parseQty(r.quantity),
        costPerUnitUgx: new BigNumber(r.costPerUnitUgx).toFixed(2),
      }))

      const result =
        scope === "store"
          ? await addStoreOpeningBalance({ data: { items } })
          : await addShopOpeningBalance({ data: { shopId, items } })

      setSummary({
        scope,
        itemCount: result.itemCount,
        totalValueUgx: result.totalValueUgx,
      })
      setRows([newRow()])
      setConfirmOpen(false)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  const scopeLabel = scope === "store" ? "the Warehouse" : "Shop"
  const selectedShopName =
    scope === "shop" ? shops.find((s) => s.id === shopId)?.name : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {scope === "store"
            ? "Warehouse opening balance"
            : "Shop opening balance"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {scope === "shop" && (
          <div className="space-y-2 max-w-sm">
            <FieldLabel htmlFor="ob-shop" help="openingBalance.shop">
              Shop
            </FieldLabel>
            {shops.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No shops configured yet. Create one on the Shop page first.
              </p>
            ) : (
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger id="ob-shop" className="w-full">
                  <SelectValue placeholder="Select a shop" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.location ? ` — ${s.location}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {summary && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            Posted {summary.itemCount} item{summary.itemCount === 1 ? "" : "s"}{" "}
            worth{" "}
            <span className="font-mono font-semibold">
              {roundUgxBankers50(summary.totalValueUgx).toFormat(0)}
            </span>{" "}
            UGX as opening balance for{" "}
            {summary.scope === "store" ? "the Warehouse" : "the selected Shop"}.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="inline-flex items-center gap-1.5">
                    Product Name * <InfoTip term="openingBalance.productName" />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1.5">
                    Article # <InfoTip term="openingBalance.articleNumber" />
                  </span>
                </TableHead>
                <TableHead className="text-right w-32">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Quantity * <InfoTip term="openingBalance.quantity" />
                  </span>
                </TableHead>
                <TableHead className="text-right w-48">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Cost / Unit (UGX) *{" "}
                    <InfoTip term="openingBalance.costPerUnit" />
                  </span>
                </TableHead>
                <TableHead className="text-right w-40">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Line Total <InfoTip term="openingBalance.lineTotal" />
                  </span>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const lineTotal = rowIsValid(r)
                  ? new BigNumber(r.costPerUnitUgx).times(parseQty(r.quantity))
                  : null
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Input
                        value={r.productName}
                        onChange={(e) =>
                          updateRow(r.id, { productName: e.target.value })
                        }
                        placeholder="e.g. Cotton T-Shirt"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.articleNumber}
                        onChange={(e) =>
                          updateRow(r.id, { articleNumber: e.target.value })
                        }
                        placeholder="optional"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={r.quantity}
                        onChange={(e) =>
                          updateRow(r.id, { quantity: e.target.value })
                        }
                        className="text-right font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyInput
                        currency="UGX"
                        roundTo={50}
                        decimals={2}
                        value={r.costPerUnitUgx}
                        onChange={(v) => updateRow(r.id, { costPerUnitUgx: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {lineTotal ? roundUgxBankers50(lineTotal).toFormat(0) : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeRow(r.id)}
                        disabled={rows.length === 1}
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-4 w-4" />
            Add Row
          </Button>
          <div className="text-sm text-muted-foreground">
            {validCount} of {rows.length} rows valid · Total:{" "}
            <span className="font-mono font-semibold text-foreground">
              {roundUgxBankers50(total).toFormat(0)}
            </span>{" "}
            UGX
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            disabled={!canSubmit || pending}
            onClick={() => setConfirmOpen(true)}
          >
            Submit Opening Balance
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm opening balance</DialogTitle>
              <DialogDescription>
                This will add{" "}
                <span className="font-semibold">{rows.length}</span> item
                {rows.length === 1 ? "" : "s"} worth{" "}
                <span className="font-mono font-semibold">
                  {roundUgxBankers50(total).toFormat(0)}
                </span>{" "}
                UGX to{" "}
                {scope === "store"
                  ? scopeLabel
                  : `${scopeLabel}${selectedShopName ? ` "${selectedShopName}"` : ""}`}{" "}
                as opening balance. This permanently affects the books. Continue?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={performSubmit} disabled={pending}>
                {pending ? "Posting..." : "Confirm & Post"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
