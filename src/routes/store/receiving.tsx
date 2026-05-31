import { createFileRoute, useRouter } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import { useEffect, useState, useCallback } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { FieldLabel } from "#/components/ui/field-label"
import { Badge } from "#/components/ui/badge"
import { InfoTip } from "#/components/ui/info-tip"
import { Textarea } from "#/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import {
  listReceivableRoutes,
  getUnreceivedItems,
  receiveGoods,
} from "#/server/functions/store/receiving"
import { ensureStore } from "#/server/functions/admin/locations"
import { getReceivingPrereqs } from "#/server/functions/prereqs/receiving"

export const Route = createFileRoute("/store/receiving")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "warehouse.receiving"),
  loader: async () => {
    await ensureStore()
    const [routes, prerequisites] = await Promise.all([
      listReceivableRoutes(),
      getReceivingPrereqs(),
    ])
    return { routes, prerequisites }
  },
  component: ReceivingPage,
})

function ReceivingPage() {
  const { routes, prerequisites } = Route.useLoaderData()
  const { session } = Route.useRouteContext()
  const role = session?.user.role
  const todayLocal = new Date().toLocaleDateString("en-CA") // YYYY-MM-DD in browser locale
  const [receivedDateInput, setReceivedDateInput] = useState<string>(todayLocal)
  const [selectedRouteId, setSelectedRouteId] = useState<string>("")
  const [items, setItems] = useState<
    Array<{
      id: string
      size: string
      quantity: number
      totalCostUgx: string
      supplier: { name: string }
      itemColor: {
        colorName: string
        colorHex: string
        item: { name: string; articleNumber: string }
      }
    }>
  >([])
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})
  const [discrepancyNotes, setDiscrepancyNotes] = useState<
    Record<string, string>
  >({})
  const [discrepancyOpen, setDiscrepancyOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const router = useRouter()

  const [unresolvedCount, setUnresolvedCount] = useState(0)

  const loadItems = useCallback(async (routeId: string) => {
    setSelectedRouteId(routeId)
    if (!routeId) {
      setItems([])
      setUnresolvedCount(0)
      return
    }
    const unreceived = await getUnreceivedItems({
      data: { supplyRouteId: routeId },
    })
    // Aggregate/color-only rows must be split into full variants by an admin
    // before they can be received. Skip them here and surface a count.
    const receivable = unreceived.flatMap((i) =>
      i.itemColor && i.size
        ? [
            {
              id: i.id,
              size: i.size,
              quantity: i.quantity,
              totalCostUgx: i.totalCostUgx,
              supplier: i.supplier,
              itemColor: i.itemColor,
            },
          ]
        : [],
    )
    setUnresolvedCount(unreceived.length - receivable.length)
    setItems(receivable)
    const qtys: Record<string, number> = {}
    for (const i of receivable) {
      qtys[i.id] = i.quantity
    }
    setReceivedQtys(qtys)
    setDiscrepancyNotes({})
  }, [])

  useEffect(() => {
    if (routes.length === 1 && !selectedRouteId) {
      void loadItems(routes[0].id)
    }
  }, [routes, selectedRouteId, loadItems])

  const discrepantItems = items.filter(
    (i) => (receivedQtys[i.id] ?? i.quantity) < i.quantity,
  )

  async function submitReceipt() {
    setPending(true)
    setSubmitError(null)
    try {
      await receiveGoods({
        data: {
          supplyRouteId: selectedRouteId,
          items: items.map((i) => ({
            supplyRouteLineId: i.id,
            quantityReceived: receivedQtys[i.id] ?? i.quantity,
            discrepancyNotes: (discrepancyNotes[i.id] ?? "").trim() || undefined,
          })),
          receivedDate: new Date(`${receivedDateInput}T12:00:00`),
        },
      })
      setDiscrepancyOpen(false)
      void router.invalidate()
      await router.navigate({ to: "/store" })
    } catch (err) {
      console.error("Failed to receive goods:", err)
      setSubmitError(
        err instanceof Error ? err.message : "Failed to receive goods.",
      )
    } finally {
      setPending(false)
    }
  }

  function handleReceive() {
    if (!selectedRouteId || items.length === 0) return
    if (discrepantItems.length > 0) {
      setDiscrepancyOpen(true)
      return
    }
    void submitReceipt()
  }

  const allDiscrepancyNotesFilled = discrepantItems.every(
    (i) => (discrepancyNotes[i.id] ?? "").trim().length > 0,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receive Goods</h1>
        <p className="text-muted-foreground">
          Receive items from a supply route into the warehouse.
        </p>
      </div>

      <PagePrerequisites result={prerequisites}>
        <div className="max-w-sm space-y-2">
          <Label>Select Supply Route</Label>
          <Select value={selectedRouteId} onValueChange={(v) => { void loadItems(v) }}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a route..." />
            </SelectTrigger>
            <SelectContent>
              {routes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}{" "}
                  <span className="text-muted-foreground">
                    ({r.status.replace("_", " ")})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {unresolvedCount > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {unresolvedCount} item{unresolvedCount === 1 ? "" : "s"} on this
            route still need a color and size assigned before they can be
            received. Open the supply route and use "Split into variants" on
            each unresolved item.
          </div>
        )}

        {items.length > 0 && (
          <div className="max-w-sm space-y-2">
            <FieldLabel help="field.receivedDate">Received date</FieldLabel>
            <Input
              type="date"
              value={receivedDateInput}
              max={todayLocal}
              onChange={(e) => setReceivedDateInput(e.target.value)}
              disabled={role !== "admin"}
            />
            {role !== "admin" && (
              <p className="text-xs text-muted-foreground">
                Only admins can change the receipt date.
              </p>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Expected <InfoTip term="col.expected" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Received <InfoTip term="col.received" />
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span>
                            {item.itemColor.item.articleNumber}{" "}
                            <span className="text-muted-foreground">
                              {item.itemColor.item.name}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <span
                              className="size-3 rounded-full border"
                              style={{
                                backgroundColor: item.itemColor.colorHex,
                              }}
                              aria-hidden
                            />
                            {item.itemColor.colorName} · {item.size}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{item.supplier.name}</TableCell>
                      <TableCell className="text-right">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={item.quantity}
                          className="w-20 ml-auto text-right"
                          value={receivedQtys[item.id] ?? ""}
                          onChange={(e) =>
                            setReceivedQtys((q) => ({
                              ...q,
                              [item.id]: Number(e.target.value),
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <Button onClick={handleReceive} disabled={pending}>
                {pending ? "Receiving..." : "Confirm Receipt"}
              </Button>
              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}
            </div>
          </div>
        )}

        <Dialog open={discrepancyOpen} onOpenChange={setDiscrepancyOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Explain Discrepancies</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Fewer items arrived than expected. Record why for each item below.
            </p>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {discrepantItems.map((item) => {
                const received = receivedQtys[item.id] ?? item.quantity
                const missing = item.quantity - received
                return (
                  <div key={item.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {item.itemColor.item.articleNumber}{" "}
                          <span className="text-muted-foreground">
                            {item.itemColor.item.name}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span
                            className="size-3 rounded-full border"
                            style={{
                              backgroundColor: item.itemColor.colorHex,
                            }}
                            aria-hidden
                          />
                          {item.itemColor.colorName} · {item.size}
                        </span>
                      </div>
                      <Badge variant="destructive">{missing} missing</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Expected {item.quantity}, received {received}
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="e.g. 10 boxes held at customs"
                      value={discrepancyNotes[item.id] ?? ""}
                      onChange={(e) =>
                        setDiscrepancyNotes((n) => ({
                          ...n,
                          [item.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                )
              })}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDiscrepancyOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => { void submitReceipt() }}
                disabled={pending || !allDiscrepancyNotesFilled}
              >
                {pending ? "Receiving..." : "Confirm Receipt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PagePrerequisites>
    </div>
  )
}
