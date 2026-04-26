import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
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
      alreadyReceived: number
      remaining: number
    }>
  >([])
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})
  const [damagedQtys, setDamagedQtys] = useState<Record<string, number>>({})
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
    setItems(unreceived.filter((i) => i.remaining > 0))
    const qtys: Record<string, number> = {}
    for (const i of unreceived) {
      if (i.remaining > 0) qtys[i.id] = i.remaining
    }
    setReceivedQtys(qtys)
    setDamagedQtys({})
  }

  async function handleReceive() {
    if (!selectedRouteId || items.length === 0) return
    setPending(true)
    try {
      const res = await receiveGoods({
        data: {
          supplyRouteId: selectedRouteId,
          items: items.map((i) => ({
            supplyRouteItemId: i.id,
            quantityReceived: receivedQtys[i.id] ?? i.remaining,
            quantityDamaged: damagedQtys[i.id] ?? 0,
          })),
        },
      })
      setResults(res)
      setItems([])
      router.invalidate()
    } catch (err) {
      console.error("Failed to receive goods:", err)
    } finally {
      setPending(false)
    }
  }

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
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Already Rcvd</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Damaged</TableHead>
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
                      {item.alreadyReceived}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.remaining}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={item.remaining}
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
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Damaged</TableHead>
                    <TableHead className="text-right">Transit Loss</TableHead>
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
    </div>
  )
}
