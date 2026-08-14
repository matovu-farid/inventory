import { createFileRoute, useRouter } from '@tanstack/react-router'
import { requireUiPermission } from '#/lib/permissions'
import { useEffect, useState, useCallback } from 'react'
import { Split } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { FieldLabel } from '#/components/ui/field-label'
import { Badge } from '#/components/ui/badge'
import { InfoPopover } from '#/components/ui/info-popover'
import { Textarea } from '#/components/ui/textarea'
import { SplitItemForm } from '#/components/supply/split-item-form'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { PagePrerequisites } from '#/components/prerequisites/page-prerequisites'
import {
  listReceivableRoutes,
  getUnreceivedItems,
  receiveGoods,
} from '#/server/functions/store/receiving'
import { ensureStore } from '#/server/functions/admin/locations'
import { getReceivingPrereqs } from '#/server/functions/prereqs/receiving'

export const Route = createFileRoute('/store/receiving')({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, 'warehouse.receiving'),
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
  const todayLocal = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in browser locale
  const [receivedDateInput, setReceivedDateInput] = useState<string>(todayLocal)
  const [selectedRouteId, setSelectedRouteId] = useState<string>('')
  const [items, setItems] = useState<
    Array<{
      id: string
      size: string | null
      quantity: number
      totalCostUgx: string
      supplier: { name: string }
      itemColor: {
        id: string
        colorName: string
        colorHex: string
        item: { name: string; articleNumber: string }
      } | null
      item: { name: string; articleNumber: string } | null
    }>
  >([])
  const [splittingItemId, setSplittingItemId] = useState<string | null>(null)
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
    const receivable = unreceived.map((i) => ({
      id: i.id,
      size: i.size,
      quantity: i.quantity,
      totalCostUgx: i.totalCostUgx,
      supplier: i.supplier,
      itemColor: i.itemColor ?? null,
      item: i.item ?? i.itemColor?.item ?? null,
    }))
    setUnresolvedCount(receivable.filter((r) => !r.itemColor || !r.size).length)
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

  const splittingItem = items.find((i) => i.id === splittingItemId) ?? null

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
            discrepancyNotes:
              (discrepancyNotes[i.id] ?? '').trim() || undefined,
          })),
          receivedDate:
            receivedDateInput === todayLocal
              ? new Date()
              : new Date(`${receivedDateInput}T12:00:00`),
        },
      })
      setDiscrepancyOpen(false)
      void router.invalidate()
      await router.navigate({ to: '/store' })
    } catch (err) {
      console.error('Failed to receive goods:', err)
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to receive goods.',
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
    (i) => (discrepancyNotes[i.id] ?? '').trim().length > 0,
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
          <Select
            value={selectedRouteId}
            onValueChange={(v) => {
              void loadItems(v)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a route..." />
            </SelectTrigger>
            <SelectContent>
              {routes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}{' '}
                  <span className="text-muted-foreground">
                    ({r.status.replace('_', ' ')})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {unresolvedCount > 0 && (
          <p className="text-sm text-muted-foreground">
            {unresolvedCount} item{unresolvedCount === 1 ? '' : 's'} on this
            route have no color or size yet. You can receive as-is and label
            them later, or use Split to assign variants now.
          </p>
        )}

        {items.length > 0 && (
          <div className="max-w-sm space-y-2">
            <FieldLabel help="field.receivedDate">Received date</FieldLabel>
            <Input
              type="date"
              value={receivedDateInput}
              max={todayLocal}
              onChange={(e) => setReceivedDateInput(e.target.value)}
              disabled={role !== 'admin'}
            />
            {role !== 'admin' && (
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
                        Expected <InfoPopover term="col.expected" />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1.5">
                        Received <InfoPopover term="col.received" />
                      </span>
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span>
                            {(item.itemColor?.item.articleNumber ??
                              item.item?.articleNumber) ||
                              '—'}{' '}
                            <span className="text-muted-foreground">
                              {item.itemColor?.item.name ??
                                item.item?.name ??
                                ''}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            {item.itemColor ? (
                              <>
                                <span
                                  className="size-3 rounded-full border"
                                  style={{
                                    backgroundColor: item.itemColor.colorHex,
                                  }}
                                  aria-hidden
                                />
                                {item.itemColor.colorName}
                                {item.size ? ` · ${item.size}` : ' · —'}
                              </>
                            ) : null}
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
                          value={receivedQtys[item.id] ?? ''}
                          onChange={(e) =>
                            setReceivedQtys((q) => ({
                              ...q,
                              [item.id]: Number(e.target.value),
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {(!item.itemColor || !item.size) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => setSplittingItemId(item.id)}
                          >
                            <Split className="mr-1 h-3.5 w-3.5" />
                            Split
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <Button onClick={handleReceive} disabled={pending}>
                {pending ? 'Receiving...' : 'Confirm Receipt'}
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
                  <div
                    key={item.id}
                    className="space-y-2 rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">
                          {(item.itemColor?.item.articleNumber ??
                            item.item?.articleNumber) ||
                            '—'}{' '}
                          <span className="text-muted-foreground">
                            {item.itemColor?.item.name ?? item.item?.name ?? ''}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          {item.itemColor ? (
                            <>
                              <span
                                className="size-3 rounded-full border"
                                style={{
                                  backgroundColor: item.itemColor.colorHex,
                                }}
                                aria-hidden
                              />
                              {item.itemColor.colorName}
                              {item.size ? ` · ${item.size}` : ' · —'}
                            </>
                          ) : null}
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
                      value={discrepancyNotes[item.id] ?? ''}
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
                onClick={() => {
                  void submitReceipt()
                }}
                disabled={pending || !allDiscrepancyNotesFilled}
              >
                {pending ? 'Receiving...' : 'Confirm Receipt'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={splittingItem !== null}
          onOpenChange={(open) => !open && setSplittingItemId(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Split into variants</DialogTitle>
            </DialogHeader>
            {splittingItem && (
              <SplitItemForm
                item={{
                  id: splittingItem.id,
                  quantity: splittingItem.quantity,
                  itemColor: splittingItem.itemColor
                    ? {
                        id: splittingItem.itemColor.id,
                        colorName: splittingItem.itemColor.colorName,
                        colorHex: splittingItem.itemColor.colorHex,
                        item: splittingItem.itemColor.item,
                      }
                    : null,
                  product: splittingItem.item,
                  size: splittingItem.size,
                }}
                onSuccess={() => {
                  setSplittingItemId(null)
                  if (selectedRouteId) void loadItems(selectedRouteId)
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </PagePrerequisites>
    </div>
  )
}
