import { useState } from "react"
import { Button } from "#/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "#/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import {
  promoteRequisitionsToRoute,
  dismissRequisition,
} from "#/server/functions/store/requisitions"

export interface RequisitionRow {
  id: string
  storeName: string
  itemLabel: string
  suggestedQuantity: number
  baseline: number
  quantityAtOpen: number
  openedAt: Date | string
}

export interface RouteOption {
  id: string
  name: string
}

export interface SupplierOption {
  id: string
  name: string
}

export function RequisitionsTable({
  rows,
  routes,
  suppliers,
  onChanged,
}: {
  rows: RequisitionRow[]
  routes: RouteOption[]
  suppliers: SupplierOption[]
  onChanged: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Typical</TableHead>
            <TableHead>Suggested</TableHead>
            <TableHead>Opened</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={picked.has(r.id)}
                  onChange={(e) => {
                    const next = new Set(picked)
                    if (e.target.checked) next.add(r.id)
                    else next.delete(r.id)
                    setPicked(next)
                  }}
                />
              </TableCell>
              <TableCell>{r.storeName}</TableCell>
              <TableCell className="font-medium">{r.itemLabel}</TableCell>
              <TableCell>{r.quantityAtOpen}</TableCell>
              <TableCell>{r.baseline}</TableCell>
              <TableCell>{r.suggestedQuantity}</TableCell>
              <TableCell>
                {new Date(r.openedAt).toLocaleDateString("en-GB")}
              </TableCell>
              <TableCell>
                <DismissButton id={r.id} onDone={onChanged} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No open requisitions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PromoteDialog
        selectedIds={[...picked]}
        routes={routes}
        suppliers={suppliers}
        onDone={() => {
          setPicked(new Set())
          onChanged()
        }}
      />
    </div>
  )
}

function PromoteDialog({
  selectedIds,
  routes,
  suppliers,
  onDone,
}: {
  selectedIds: string[]
  routes: RouteOption[]
  suppliers: SupplierOption[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "")
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      await promoteRequisitionsToRoute({
        data: {
          requisitionIds: selectedIds,
          supplyRouteId: routeId,
          supplierId,
        },
      })
      setOpen(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to promote.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={selectedIds.length === 0}>
          Add {selectedIds.length || ""} to supply route
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote requisitions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Planning route</label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Supplier</label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue />
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
          {error !== null && (
            <p className="text-sm text-rose-700">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              void go()
            }}
            disabled={busy || !routeId || !supplierId}
          >
            {busy ? "Adding…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DismissButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      await dismissRequisition({ data: { id, reason } })
      setOpen(false)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Dismiss
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss requisition</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Why are you dismissing? (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button
            onClick={() => {
              void go()
            }}
            disabled={busy || reason.trim().length === 0}
          >
            {busy ? "Dismissing…" : "Dismiss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
