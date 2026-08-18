import { useEffect, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Textarea } from '#/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { confirmTransferReceipt } from '#/server/functions/store/transfers'
import { formatDate } from '#/lib/format'
import { formatItemArticleNumbers } from '#/lib/items/article-number'

export interface ReceivableTransfer {
  id: string
  shop: { name: string }
  transferDate: Date
  items: Array<{
    id: string
    quantityDispatched: number
    // Plan 2a: transfer lines are item-level. `item` is always present;
    // `variant` is null for unresolved lots (item dispatched without a
    // chosen color/size). The display omits the color/size span when null.
    item: { name: string; articleNumbers: Array<{ articleNumber: string }> }
    variant: {
      size: string
      color: {
        colorName: string
        colorHex: string
      }
    } | null
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
  const [transferId, setTransferId] = useState(transfers[0]?.id ?? '')
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
    const t = transfers.find((x) => x.id === transferId)
    if (t && t.items.length > 0) {
      const qtys: Record<string, number> = {}
      for (const item of t.items) {
        qtys[item.id] = item.quantityDispatched
      }
      setReceivedQtys(qtys)
      setDiscrepancyNotes({})
    }
  }, [transferId, transfers])

  const discrepantItems = transfer
    ? transfer.items.filter(
        (i) =>
          (receivedQtys[i.id] ?? i.quantityDispatched) < i.quantityDispatched,
      )
    : []

  const allDiscrepancyNotesFilled = discrepantItems.every(
    (i) => (discrepancyNotes[i.id] ?? '').trim().length > 0,
  )

  async function handleConfirm() {
    if (!transfer) return
    if (!allDiscrepancyNotesFilled) return
    setPending(true)
    try {
      await confirmTransferReceipt({
        data: {
          transferId: transfer.id,
          items: transfer.items.map((i) => {
            const raw = discrepancyNotes[i.id]
            const trimmed = typeof raw === 'string' ? raw.trim() : ''
            return {
              transferItemId: i.id,
              quantityReceived: receivedQtys[i.id] ?? i.quantityDispatched,
              discrepancyNotes: trimmed.length > 0 ? trimmed : undefined,
            }
          }),
        },
      })
      onSuccess()
    } catch (err) {
      console.error('Failed to confirm receipt:', err)
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
                  {t.shop.name} — {formatDate(t.transferDate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {transfer && (
        <>
          <ResponsiveTable
            data={transfer.items}
            getRowKey={(item) => item.id}
            columns={[
              {
                header: 'Item',
                cell: (line) => {
                  const v = line.variant
                  return (
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {formatItemArticleNumbers(line.item.articleNumbers)}{' '}
                        {line.item.name}
                      </span>
                      {v && (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                          <span
                            className="size-3 rounded-full border"
                            style={{ backgroundColor: v.color.colorHex }}
                            aria-hidden
                          />
                          {v.color.colorName} · {v.size}
                        </span>
                      )}
                    </div>
                  )
                },
              },
              {
                header: 'Dispatched',
                align: 'right',
                cell: (item) => item.quantityDispatched,
              },
              {
                header: 'Received',
                align: 'right',
                cell: (item) => {
                  const received =
                    receivedQtys[item.id] ?? item.quantityDispatched
                  return (
                    <Input
                      type="number"
                      min={0}
                      max={item.quantityDispatched}
                      className="h-11 w-20 ml-auto text-right text-base"
                      value={received}
                      onChange={(e) =>
                        setReceivedQtys((q) => ({
                          ...q,
                          [item.id]: Number(e.target.value),
                        }))
                      }
                    />
                  )
                },
              },
            ]}
          />

          {discrepantItems.length > 0 && (
            <div className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50/60 p-4 dark:border-amber-400/30 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Fewer items received than dispatched. Explain why for each item.
              </p>
              {discrepantItems.map((line) => {
                const received =
                  receivedQtys[line.id] ?? line.quantityDispatched
                const missing = line.quantityDispatched - received
                const v = line.variant
                const label = v
                  ? `${formatItemArticleNumbers(line.item.articleNumbers)} ${line.item.name} · ${v.color.colorName} · ${v.size}`
                  : `${formatItemArticleNumbers(line.item.articleNumbers)} ${line.item.name}`
                return (
                  <div key={line.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <Badge variant="destructive">{missing} missing</Badge>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder="e.g. lost during delivery, broken on the way"
                      value={discrepancyNotes[line.id] ?? ''}
                      onChange={(e) =>
                        setDiscrepancyNotes((n) => ({
                          ...n,
                          [line.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                )
              })}
            </div>
          )}

          <div className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-3 md:static md:mx-0 md:mb-0 md:border-t-0 md:bg-transparent md:p-0">
            <Button
              className="h-12 w-full md:h-10"
              onClick={() => void handleConfirm()}
              disabled={pending || !allDiscrepancyNotesFilled}
            >
              {pending ? 'Confirming...' : 'Confirm Receipt at Shop'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
