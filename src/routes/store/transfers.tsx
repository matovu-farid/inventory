import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { getTransfersPrereqs } from "#/server/functions/prereqs/transfers"
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
import { Plus, PackageCheck } from "lucide-react"
import {
  listTransfers,
  createTransfer,
  confirmTransferReceipt,
} from "#/server/functions/store/transfers"
import { getStoreStock } from "#/server/functions/store/receiving"
import { listShops } from "#/server/functions/admin/locations"

export const Route = createFileRoute("/store/transfers")({
  loader: async () => {
    const [transfers, stock, shops, prerequisites] = await Promise.all([
      listTransfers(),
      getStoreStock(),
      listShops(),
      getTransfersPrereqs(),
    ])
    return { transfers, stock, shops, prerequisites }
  },
  component: TransfersPage,
})

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  dispatched: "default",
  received: "secondary",
  reconciled: "secondary",
}

function TransfersPage() {
  const { transfers, stock, shops, prerequisites } = Route.useLoaderData()
  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const router = useRouter()

  const dispatchedTransfers = transfers.filter((t) => t.status === "dispatched")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Store Transfers</h1>
        <p className="text-muted-foreground">
          Transfer goods from warehouse to shops.
        </p>
      </div>

      <PagePrerequisites result={prerequisites}>
        <div className="flex items-center justify-end">
          <div className="flex gap-2">
            {dispatchedTransfers.length > 0 && (
              <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Confirm Receipt
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Confirm Transfer Receipt</DialogTitle>
                  </DialogHeader>
                  <ReceiveTransferForm
                    transfers={dispatchedTransfers}
                    onSuccess={() => {
                      setReceiveOpen(false)
                      router.invalidate()
                    }}
                  />
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Transfer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Create Transfer</DialogTitle>
                </DialogHeader>
                <CreateTransferForm
                  stock={stock}
                  shops={shops}
                  onSuccess={() => {
                    setCreateOpen(false)
                    router.invalidate()
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {transfers.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center">
            No transfers yet. Create one to move goods from the warehouse to a
            shop.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shop</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total (UGX)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => {
                  const total = t.items.reduce(
                    (s, i) => s.plus(i.totalPriceUgx),
                    new BigNumber(0),
                  )
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        {new Date(t.transferDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">
                        {t.shop.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[t.status] ?? "outline"}>
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {t.items.length}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {total.toFormat(0)}
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

/* ------------------------------------------------------------------ */
/* Create Transfer Form                                                */
/* ------------------------------------------------------------------ */

function CreateTransferForm({
  stock,
  shops,
  onSuccess,
}: {
  stock: Array<{
    id: string
    productName: string
    quantityOnHand: number
    minimumSellPriceUgx: string
  }>
  shops: Array<{ id: string; name: string }>
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [shopId, setShopId] = useState("")
  const [selectedItems, setSelectedItems] = useState<
    Array<{ storeStockId: string; qty: number }>
  >([])

  const availableStock = stock.filter((s) => s.quantityOnHand > 0)

  function toggleItem(stockId: string) {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.storeStockId === stockId)
      if (exists) return prev.filter((i) => i.storeStockId !== stockId)
      const item = stock.find((s) => s.id === stockId)
      return [...prev, { storeStockId: stockId, qty: item?.quantityOnHand ?? 1 }]
    })
  }

  function setQty(stockId: string, qty: number) {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.storeStockId === stockId ? { ...i, qty } : i,
      ),
    )
  }

  async function handleSubmit() {
    if (!shopId || selectedItems.length === 0) return
    setPending(true)
    try {
      await createTransfer({
        data: {
          shopId,
          items: selectedItems.map((i) => ({
            storeStockId: i.storeStockId,
            quantityDispatched: i.qty,
          })),
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to create transfer:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Destination Shop *</Label>
        <Select value={shopId} onValueChange={setShopId}>
          <SelectTrigger>
            <SelectValue placeholder="Select shop" />
          </SelectTrigger>
          <SelectContent>
            {shops.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Select Items</Label>
        <div className="max-h-64 overflow-y-auto border rounded-md">
          {availableStock.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm text-center">
              No stock available.
            </p>
          ) : (
            availableStock.map((s) => {
              const selected = selectedItems.find(
                (i) => i.storeStockId === s.id,
              )
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 border-b last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={!!selected}
                    onChange={() => toggleItem(s.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.productName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Available: {s.quantityOnHand} | Min:{" "}
                      {new BigNumber(s.minimumSellPriceUgx).toFormat(0)} UGX
                    </p>
                  </div>
                  {selected && (
                    <Input
                      type="number"
                      min={1}
                      max={s.quantityOnHand}
                      className="w-20 text-right"
                      value={selected.qty}
                      onChange={(e) => setQty(s.id, Number(e.target.value))}
                    />
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={pending || !shopId || selectedItems.length === 0}
      >
        {pending ? "Creating..." : `Dispatch ${selectedItems.length} items`}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Receive Transfer Form                                               */
/* ------------------------------------------------------------------ */

function ReceiveTransferForm({
  transfers,
  onSuccess,
}: {
  transfers: Array<{
    id: string
    shop: { name: string }
    transferDate: Date
    items: Array<{
      id: string
      productName: string
      quantityDispatched: number
    }>
  }>
  onSuccess: () => void
}) {
  const [pending, setPending] = useState(false)
  const [transferId, setTransferId] = useState(transfers[0]?.id ?? "")
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})

  const transfer = transfers.find((t) => t.id === transferId)

  function initQtys(tid: string) {
    const t = transfers.find((x) => x.id === tid)
    if (!t) return
    const qtys: Record<string, number> = {}
    for (const item of t.items) {
      qtys[item.id] = item.quantityDispatched
    }
    setReceivedQtys(qtys)
    setTransferId(tid)
  }

  useEffect(() => {
    if (transfer && transfer.items.length > 0) {
      const qtys: Record<string, number> = {}
      for (const item of transfer.items) {
        qtys[item.id] = item.quantityDispatched
      }
      setReceivedQtys(qtys)
    }
  }, [transferId])

  async function handleConfirm() {
    if (!transfer) return
    setPending(true)
    try {
      await confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: transfer.items.map((i) => ({
            transferItemId: i.id,
            quantityReceived: receivedQtys[i.id] ?? i.quantityDispatched,
          })),
        },
      })
      onSuccess()
    } catch (err) {
      console.error("Failed to confirm receipt:", err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      {transfers.length > 1 && (
        <div className="space-y-2">
          <Label>Select Transfer</Label>
          <Select value={transferId} onValueChange={initQtys}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {transfers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.shop.name} —{" "}
                  {new Date(t.transferDate).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {transfer && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Dispatched</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.productName}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.quantityDispatched}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      max={item.quantityDispatched}
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

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? "Confirming..." : "Confirm Receipt at Shop"}
          </Button>
        </>
      )}
    </div>
  )
}
