import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
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
import {
  listReceivableRoutes,
  getUnreceivedItems,
  receiveGoods,
} from "#/server/functions/store/receiving"
import { ensureStore } from "#/server/functions/admin/locations"

export const Route = createFileRoute("/store/receiving")({
  loader: async () => {
    await ensureStore()
    const routes = await listReceivableRoutes()
    return { routes }
  },
  component: ReceivingPage,
})

function ReceivingPage() {
  const { routes } = Route.useLoaderData()
  const [selectedRouteId, setSelectedRouteId] = useState<string>("")
  const [items, setItems] = useState<
    Array<{
      id: string
      productName: string
      articleNumber: string | null
      quantity: number
      totalCostUgx: string
      supplier: { name: string }
    }>
  >([])
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})
  const [damagedQtys, setDamagedQtys] = useState<Record<string, number>>({})
  const [discrepancyNotes, setDiscrepancyNotes] = useState<
    Record<string, string>
  >({})
  const [discrepancyOpen, setDiscrepancyOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [results, setResults] = useState<
    Array<{
      productName: string
      expected: number
      received: number
      damaged: number
      transitLoss: number
    }>
  >([])
  const router = useRouter()

  async function loadItems(routeId: string) {
    setSelectedRouteId(routeId)
    setResults([])
    if (!routeId) {
      setItems([])
      return
    }
    const unreceived = await getUnreceivedItems({
      data: { supplyRouteId: routeId },
    })
    setItems(unreceived)
    const qtys: Record<string, number> = {}
    for (const i of unreceived) {
      qtys[i.id] = i.quantity
    }
    setReceivedQtys(qtys)
    setDamagedQtys({})
    setDiscrepancyNotes({})
  }

  const discrepantItems = items.filter(
    (i) => (receivedQtys[i.id] ?? i.quantity) < i.quantity,
  )

  async function submitReceipt() {
    setPending(true)
    try {
      const res = await receiveGoods({
        data: {
          supplyRouteId: selectedRouteId,
          items: items.map((i) => ({
            supplyRouteItemId: i.id,
            quantityReceived: receivedQtys[i.id] ?? i.quantity,
            quantityDamaged: damagedQtys[i.id] ?? 0,
            discrepancyNotes: discrepancyNotes[i.id]?.trim() || undefined,
          })),
        },
      })
      setResults(res)
      setItems([])
      setDiscrepancyOpen(false)
      router.invalidate()
    } catch (err) {
      console.error("Failed to receive goods:", err)
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

  const totalTransitLoss = results.reduce((s, r) => s + r.transitLoss, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Receive Goods</h1>
        <p className="text-muted-foreground">
          Receive items from a supply route into the warehouse.
        </p>
      </div>

      <div className="max-w-sm space-y-2">
        <Label>Select Supply Route</Label>
        <Select value={selectedRouteId} onValueChange={loadItems}>
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
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1.5">
                      Damaged <InfoTip term="col.damaged" />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.productName}
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
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        className="w-20 ml-auto text-right"
                        value={damagedQtys[item.id] ?? ""}
                        onChange={(e) =>
                          setDamagedQtys((q) => ({
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

          <Button onClick={handleReceive} disabled={pending}>
            {pending ? "Receiving..." : "Confirm Receipt"}
          </Button>
        </div>
      )}

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Receipt Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
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
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Damaged <InfoTip term="col.damaged" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Transit Loss <InfoTip term="col.transitLoss" />
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">
                        {r.productName}
                      </TableCell>
                      <TableCell className="text-right">{r.expected}</TableCell>
                      <TableCell className="text-right">{r.received}</TableCell>
                      <TableCell className="text-right">{r.damaged}</TableCell>
                      <TableCell className="text-right">
                        {r.transitLoss > 0 ? (
                          <Badge variant="destructive">{r.transitLoss}</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalTransitLoss > 0 && (
              <p className="mt-3 text-sm text-destructive font-medium">
                Total transit loss: {totalTransitLoss} items
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {routes.length === 0 && (
        <p className="text-muted-foreground py-8 text-center">
          No supply routes ready for receiving. Routes must be in "in transit"
          or "received" status.
        </p>
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
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.productName}</span>
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
              onClick={submitReceipt}
              disabled={pending || !allDiscrepancyNotesFilled}
            >
              {pending ? "Receiving..." : "Confirm Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
