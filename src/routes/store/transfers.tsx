import { roundUgxBankers50, formatDate } from '#/lib/format'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { requireUiPermission } from '#/lib/permissions'
import BigNumber from 'bignumber.js'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Badge } from '#/components/ui/badge'
import { PrereqBanner } from '#/components/prerequisites/prereq-banner'
import { getTransfersPrereqs } from '#/server/functions/prereqs/transfers'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { DialogTrigger } from '#/components/ui/dialog'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { Plus, PackageCheck } from 'lucide-react'
import {
  listTransfers,
  createTransfer,
} from '#/server/functions/store/transfers'
import { ReceiveTransferForm } from '#/components/transfers/receive-transfer-form'
import { getStoreStock } from '#/server/functions/store/receiving'
import { listShops } from '#/server/functions/admin/locations'

export const Route = createFileRoute('/store/transfers')({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, 'warehouse.transfers'),
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

const STATUS_COLORS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pending: 'outline',
  dispatched: 'default',
  received: 'secondary',
  reconciled: 'secondary',
}

function TransfersPage() {
  const { transfers, stock, shops, prerequisites } = Route.useLoaderData()
  const [createOpen, setCreateOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const router = useRouter()

  const dispatchedTransfers = transfers.filter((t) => t.status === 'dispatched')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Store Transfers</h1>
        <p className="text-muted-foreground">
          Transfer goods from warehouse to shops.
        </p>
      </div>

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
                    void router.invalidate()
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!prerequisites.satisfied}>
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
                onSuccess={(shopId) => {
                  setCreateOpen(false)
                  void router.invalidate()
                  void router.navigate({ to: '/shop', search: { shopId } })
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!prerequisites.satisfied && (
        <PrereqBanner items={prerequisites.missing} />
      )}

      <ResponsiveTable
        data={transfers}
        getRowKey={(t) => t.id}
        emptyMessage="No transfers yet. Create one to move goods from the warehouse to a shop."
        columns={[
          {
            header: 'Date',
            cell: (t) => formatDate(t.transferDate),
          },
          {
            header: 'Shop',
            cell: (t) => <span className="font-medium">{t.shop.name}</span>,
          },
          {
            header: 'Status',
            cell: (t) => (
              <Badge variant={STATUS_COLORS[t.status] ?? 'outline'}>
                {t.status}
              </Badge>
            ),
          },
          {
            header: 'Items',
            align: 'right',
            cell: (t) => t.items.length,
          },
          {
            header: 'Total (UGX)',
            align: 'right',
            cell: (t) => (
              <span className="font-mono">
                {roundUgxBankers50(
                  t.items.reduce(
                    (s, i) => s.plus(i.totalPriceUgx),
                    new BigNumber(0),
                  ),
                ).toFormat(0)}
              </span>
            ),
          },
        ]}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Create Transfer Form                                                */
/* ------------------------------------------------------------------ */

// `StockGroup` mirrors the shape returned by `getStoreStock` — one bucket
// per item, plus the underlying store_stock rows so we can offer per-variant
// dispatch (and show per-variant availability).
type StockGroup = {
  item: {
    id: string
    name: string
    articleNumber: string
  }
  totalQty: number
  rows: Array<{
    id: string
    quantityOnHand: number
    variantId: string | null
    variant: {
      id: string
      size: string
      color: { colorName: string; colorHex: string }
    } | null
  }>
}

type LineDraft = {
  itemId: string
  // `undefined` means "any (FIFO)" — server drains unresolved-first.
  variantId: string | undefined
  qty: number
}

function CreateTransferForm({
  stock,
  shops,
  onSuccess,
}: {
  stock: StockGroup[]
  shops: Array<{ id: string; name: string }>
  onSuccess: (shopId: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shopId, setShopId] = useState(shops[0]?.id ?? '')
  const [lines, setLines] = useState<LineDraft[]>([])

  // Only show item buckets with at least one unit on hand.
  const availableStock = useMemo(
    () => stock.filter((g) => g.totalQty > 0),
    [stock],
  )

  // Per-item, group rows by variant so we can render variant chips with their
  // own availability. `null` variantId (unresolved lots) is summed into a
  // separate "Unresolved" bucket — picking "Any (FIFO)" lets the server drain
  // unresolved-first.
  function variantsForItem(group: StockGroup) {
    const byVariant = new Map<
      string,
      {
        variantId: string
        size: string
        colorName: string
        colorHex: string
        qty: number
      }
    >()
    let unresolvedQty = 0
    for (const r of group.rows) {
      if (r.variant === null) {
        unresolvedQty += r.quantityOnHand
        continue
      }
      const v = r.variant
      const existing = byVariant.get(v.id)
      if (existing) {
        existing.qty += r.quantityOnHand
      } else {
        byVariant.set(v.id, {
          variantId: v.id,
          size: v.size,
          colorName: v.color.colorName,
          colorHex: v.color.colorHex,
          qty: r.quantityOnHand,
        })
      }
    }
    return {
      variants: Array.from(byVariant.values()).sort((a, b) =>
        `${a.colorName} ${a.size}`.localeCompare(`${b.colorName} ${b.size}`),
      ),
      unresolvedQty,
    }
  }

  function findLine(itemId: string) {
    return lines.find((l) => l.itemId === itemId)
  }

  function setItemSelected(itemId: string, on: boolean) {
    setLines((prev) => {
      if (!on) return prev.filter((l) => l.itemId !== itemId)
      if (prev.some((l) => l.itemId === itemId)) return prev
      const group = availableStock.find((g) => g.item.id === itemId)
      const defaultQty = group ? Math.max(1, Math.min(1, group.totalQty)) : 1
      return [...prev, { itemId, variantId: undefined, qty: defaultQty }]
    })
  }

  function setLineVariant(itemId: string, variantId: string | undefined) {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, variantId } : l)),
    )
  }

  function setLineQty(itemId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, qty } : l)),
    )
  }

  // Availability for a given line: total on-hand at the source if "Any (FIFO)",
  // or the per-variant total when a variant chip is selected.
  function availabilityFor(line: LineDraft): number {
    const group = availableStock.find((g) => g.item.id === line.itemId)
    if (!group) return 0
    if (line.variantId === undefined) return group.totalQty
    return group.rows
      .filter((r) => r.variantId === line.variantId)
      .reduce((s, r) => s + r.quantityOnHand, 0)
  }

  const allLinesValid = lines.every((l) => {
    if (l.qty <= 0) return false
    return l.qty <= availabilityFor(l)
  })

  async function handleSubmit() {
    if (!shopId || lines.length === 0) return
    if (!allLinesValid) return
    setPending(true)
    setError(null)
    try {
      await createTransfer({
        data: {
          shopId,
          items: lines.map((l) => ({
            itemId: l.itemId,
            variantId: l.variantId,
            quantityDispatched: l.qty,
          })),
        },
      })
      onSuccess(shopId)
    } catch (err) {
      console.error('Failed to create transfer:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to create transfer.',
      )
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
        <div className="max-h-80 overflow-y-auto border rounded-md">
          {availableStock.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm text-center">
              No stock available.
            </p>
          ) : (
            availableStock.map((g) => {
              const line = findLine(g.item.id)
              const { variants, unresolvedQty } = variantsForItem(g)
              const selected = line !== undefined
              return (
                <div
                  key={g.item.id}
                  className="space-y-2 p-3 border-b last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        setItemSelected(g.item.id, e.target.checked)
                      }
                      aria-label={`Select ${g.item.name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {g.item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">
                          {g.item.articleNumber}
                        </span>
                        {' · Available: '}
                        {g.totalQty}
                        {unresolvedQty > 0 && (
                          <span className="ml-1 italic">
                            ({unresolvedQty} unresolved)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {line && (
                    <div className="ml-7 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLineVariant(g.item.id, undefined)}
                          className="rounded-full"
                          aria-pressed={line.variantId === undefined}
                        >
                          <Badge
                            variant={
                              line.variantId === undefined
                                ? 'default'
                                : 'outline'
                            }
                            className="italic cursor-pointer"
                          >
                            Any (FIFO)
                          </Badge>
                        </button>
                        {variants.map((v) => {
                          const active = line.variantId === v.variantId
                          return (
                            <button
                              key={v.variantId}
                              type="button"
                              onClick={() =>
                                setLineVariant(g.item.id, v.variantId)
                              }
                              className="rounded-full"
                              aria-pressed={active}
                              title={`${v.colorName} ${v.size} — ${v.qty} on hand`}
                            >
                              <Badge
                                variant={active ? 'default' : 'outline'}
                                className="cursor-pointer inline-flex items-center gap-1.5"
                              >
                                <span
                                  className="size-2.5 rounded-full border"
                                  style={{ backgroundColor: v.colorHex }}
                                  aria-hidden
                                />
                                {v.colorName} · {v.size}
                                <span className="text-[10px] opacity-70">
                                  ({v.qty})
                                </span>
                              </Badge>
                            </button>
                          )
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`qty-${g.item.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Quantity
                        </Label>
                        <Input
                          id={`qty-${g.item.id}`}
                          type="number"
                          min={1}
                          max={availabilityFor(line)}
                          className="w-24 text-right"
                          value={line.qty}
                          onChange={(e) =>
                            setLineQty(g.item.id, Number(e.target.value))
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          of {availabilityFor(line)} available
                          {line.variantId === undefined && variants.length > 0
                            ? ' (across all variants)'
                            : ''}
                        </span>
                      </div>
                      {line.qty > availabilityFor(line) && (
                        <p className="text-xs text-destructive">
                          Quantity exceeds available stock.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button
        className="w-full"
        onClick={() => {
          void handleSubmit()
        }}
        disabled={pending || !shopId || lines.length === 0 || !allLinesValid}
      >
        {pending
          ? 'Creating...'
          : `Dispatch ${lines.length} ${lines.length === 1 ? 'item' : 'items'}`}
      </Button>
    </div>
  )
}
