import { useEffect, useState } from "react"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { InfoTip } from "#/components/ui/info-tip"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
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
import { confirmTransferReceipt } from "#/server/functions/store/transfers"

export interface ReceivableTransfer {
  id: string
  shop: { name: string }
  transferDate: Date
  items: Array<{
    id: string
    productName: string
    quantityDispatched: number
  }>
}

interface ReceiveTransferFormProps {
  transfers: ReceivableTransfer[]
  onSuccess: () => void
}

export function ReceiveTransferForm({
  transfers,
  onSuccess,
}: ReceiveTransferFormProps) {
  const [pending, setPending] = useState(false)
  const [transferId, setTransferId] = useState(transfers[0]?.id ?? "")
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({})
  const [discrepancyNotes, setDiscrepancyNotes] = useState<
    Record<string, string>
  >({})

  const transfer = transfers.find((t) => t.id === transferId)

  function initState(tid: string) {
    const t = transfers.find((x) => x.id === tid)
    if (!t) return
    const qtys: Record<string, number> = {}
    for (const item of t.items) {
      qtys[item.id] = item.quantityDispatched
    }
    setReceivedQtys(qtys)
    setDiscrepancyNotes({})
    setTransferId(tid)
  }

  useEffect(() => {
    if (transfer && transfer.items.length > 0) {
      const qtys: Record<string, number> = {}
      for (const item of transfer.items) {
        qtys[item.id] = item.quantityDispatched
      }
      setReceivedQtys(qtys)
      setDiscrepancyNotes({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferId])

  const discrepantItems = transfer
    ? transfer.items.filter(
        (i) => (receivedQtys[i.id] ?? i.quantityDispatched) < i.quantityDispatched,
      )
    : []

  const allDiscrepancyNotesFilled = discrepantItems.every(
    (i) => (discrepancyNotes[i.id] ?? "").trim().length > 0,
  )

  async function handleConfirm() {
    if (!transfer) return
    if (!allDiscrepancyNotesFilled) return
    setPending(true)
    try {
      await confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: transfer.items.map((i) => ({
            transferItemId: i.id,
            quantityReceived: receivedQtys[i.id] ?? i.quantityDispatched,
            discrepancyNotes: discrepancyNotes[i.id]?.trim() || undefined,
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
          <Select value={transferId} onValueChange={initState}>
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
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Dispatched <InfoTip term="col.dispatched" />
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    Received <InfoTip term="col.received" />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfer.items.map((item) => {
                const received = receivedQtys[item.id] ?? item.quantityDispatched
                return (
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
                        value={received}
                        onChange={(e) =>
                          setReceivedQtys((q) => ({
                            ...q,
                            [item.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {discrepantItems.length > 0 && (
            <div className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-400/30 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Fewer items received than dispatched. Explain why for each item.
              </p>
              {discrepantItems.map((item) => {
                const received = receivedQtys[item.id] ?? item.quantityDispatched
                const missing = item.quantityDispatched - received
                return (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {item.productName}
                      </span>
                      <Badge variant="destructive">{missing} missing</Badge>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="e.g. lost during delivery, broken on the way"
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
          )}

          <Button
            className="w-full"
            onClick={handleConfirm}
            disabled={pending || !allDiscrepancyNotesFilled}
          >
            {pending ? "Confirming..." : "Confirm Receipt at Shop"}
          </Button>
        </>
      )}
    </div>
  )
}
