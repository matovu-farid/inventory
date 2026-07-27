import * as React from 'react'
import {
  AlertTriangle,
  Clock,
  RefreshCw,
  Trash2,
  CheckCircle2,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Button } from '#/components/ui/button'
import { formatUgxTotal } from '#/lib/format'
import {
  getQueuedSales,
  deleteQueuedSale,
  updateQueuedSaleStatus,
} from '#/lib/offline/idb'
import type { QueuedSale } from '#/lib/offline/idb'
import { recordSale } from '#/server/functions/shop/sales'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSyncComplete?: () => void
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function getItemCount(payload: unknown): number {
  try {
    const p = payload as { items?: unknown[] }
    return p.items?.length ?? 0
  } catch {
    return 0
  }
}

function getSaleTotal(payload: unknown): number {
  try {
    const p = payload as {
      items?: Array<{ quantity: number; unitPriceUgx: string }>
    }
    return (p.items ?? []).reduce(
      (sum, i) => sum + i.quantity * Number(i.unitPriceUgx),
      0,
    )
  } catch {
    return 0
  }
}

/**
 * Sheet showing queued and failed offline sales.
 * Salesman can retry or discard failed sales.
 */
export function QueuedSalesSheet({
  open,
  onOpenChange,
  onSyncComplete,
}: Props) {
  const [sales, setSales] = React.useState<QueuedSale[]>([])
  const [retrying, setRetrying] = React.useState<string | null>(null)
  const [discardConfirm, setDiscardConfirm] = React.useState<string | null>(
    null,
  )

  async function load() {
    try {
      const all = await getQueuedSales()
      // Sort by createdAt ascending
      setSales(all.sort((a, b) => a.createdAt - b.createdAt))
    } catch {
      // IDB unavailable
    }
  }

  React.useEffect(() => {
    if (open) void load()
  }, [open])

  async function handleRetry(sale: QueuedSale) {
    setRetrying(sale.id)
    try {
      await updateQueuedSaleStatus(sale.id, 'queued', null)
      await recordSale({
        data: sale.payload as Parameters<typeof recordSale>[0]['data'],
      })
      await deleteQueuedSale(sale.id)
      onSyncComplete?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await updateQueuedSaleStatus(sale.id, 'failed', msg)
    } finally {
      setRetrying(null)
      await load()
    }
  }

  async function handleDiscard(id: string) {
    await deleteQueuedSale(id)
    setDiscardConfirm(null)
    await load()
  }

  const queued = sales.filter(
    (s) => s.status === 'queued' || s.status === 'syncing',
  )
  const failed = sales.filter((s) => s.status === 'failed')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Offline sales queue</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {/* Queued */}
          {queued.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                In queue ({queued.length})
              </p>
              <div className="space-y-2">
                {queued.map((s) => (
                  <SaleRow key={s.id} sale={s} />
                ))}
              </div>
            </section>
          )}

          {/* Failed */}
          {failed.length > 0 && (
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                <AlertTriangle className="size-3.5" />
                Needs attention ({failed.length})
              </p>
              <div className="space-y-2">
                {failed.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  >
                    <SaleRow sale={s} />
                    {s.failureReason && (
                      <p className="mt-1.5 text-xs text-destructive">
                        {s.failureReason}
                      </p>
                    )}
                    {discardConfirm === s.id ? (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                          The customer already received this sale. Discard
                          anyway?
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8"
                            onClick={() => void handleDiscard(s.id)}
                          >
                            Yes, discard
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setDiscardConfirm(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={retrying === s.id}
                          onClick={() => void handleRetry(s)}
                        >
                          <RefreshCw
                            className={`mr-1 size-3 ${retrying === s.id ? 'animate-spin' : ''}`}
                          />
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => setDiscardConfirm(s.id)}
                        >
                          <Trash2 className="mr-1 size-3" />
                          Discard
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {sales.length === 0 && (
            <div className="py-10 text-center">
              <CheckCircle2 className="mx-auto mb-2 size-8 text-green-500" />
              <p className="text-sm text-muted-foreground">All sales synced</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SaleRow({ sale }: { sale: QueuedSale }) {
  const itemCount = getItemCount(sale.payload)
  const total = getSaleTotal(sale.payload)
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Clock className="size-3.5 shrink-0" />
        <span>{formatRelative(sale.createdAt)}</span>
        <span>·</span>
        <span>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </span>
      </div>
      <span className="font-mono font-semibold">{formatUgxTotal(total)}</span>
    </div>
  )
}
