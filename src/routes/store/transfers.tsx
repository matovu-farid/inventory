import { roundUgxBankers50, formatUgx, formatDate } from "#/lib/format"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import BigNumber from "bignumber.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { MoneyInput } from "#/components/ui/money-input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import { InfoTip } from "#/components/ui/info-tip"
import { PrereqBanner } from "#/components/prerequisites/prereq-banner"
import { getTransfersPrereqs } from "#/server/functions/prereqs/transfers"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "#/components/ui/responsive-dialog"
import { DialogTrigger } from "#/components/ui/dialog"
import { ResponsiveTable } from "#/components/ui/responsive-table"
import { Plus, PackageCheck } from "lucide-react"
import {
  listTransfers,
  createTransfer,
} from "#/server/functions/store/transfers"
import { ReceiveTransferForm } from "#/components/transfers/receive-transfer-form"
import { getStoreStock } from "#/server/functions/store/receiving"
import { listShops } from "#/server/functions/admin/locations"

export const Route = createFileRoute("/store/transfers")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "warehouse.transfers"),
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
                  void router.navigate({ to: "/shop", search: { shopId } })
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
            header: "Date",
            cell: (t) => formatDate(t.transferDate),
          },
          {
            header: "Shop",
            cell: (t) => (
              <span className="font-medium">{t.shop.name}</span>
            ),
          },
          {
            header: "Status",
            cell: (t) => (
              <Badge variant={STATUS_COLORS[t.status] ?? "outline"}>
                {t.status}
              </Badge>
            ),
          },
          {
            header: "Items",
            align: "right",
            cell: (t) => t.items.length,
          },
          {
            header: "Total (UGX)",
            align: "right",
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

function CreateTransferForm({
  stock,
  shops,
  onSuccess,
}: {
  // Stock now references variant_id (issue #4); the joined variant
  // carries size + color (with parent item/product).
  stock: Array<{
    id: string
    quantityOnHand: number
    costPerUnitUgx: string
    minimumSellPriceUgx: string
    variant: {
      size: string
      color: {
        colorName: string
        colorHex: string
        item: { name: string; articleNumber: string }
      }
    }
  }>
  shops: Array<{ id: string; name: string }>
  onSuccess: (shopId: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [shopId, setShopId] = useState(shops[0]?.id ?? "")
  const [selectedItems, setSelectedItems] = useState<
    Array<{ storeStockId: string; qty: number; minSellPriceUgx: string }>
  >([])

  const availableStock = stock.filter((s) => s.quantityOnHand > 0)

  function toggleItem(stockId: string) {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.storeStockId === stockId)
      if (exists) return prev.filter((i) => i.storeStockId !== stockId)
      const item = stock.find((s) => s.id === stockId)
      return [
        ...prev,
        {
          storeStockId: stockId,
          qty: item?.quantityOnHand ?? 1,
          // Default the shop's minimum sell price to the store's cost-per-unit;
          // dispatcher can edit before submitting.
          minSellPriceUgx: item?.costPerUnitUgx ?? "",
        },
      ]
    })
  }

  function setQty(stockId: string, qty: number) {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.storeStockId === stockId ? { ...i, qty } : i,
      ),
    )
  }

  function setMinSellPrice(stockId: string, val: string) {
    setSelectedItems((prev) =>
      prev.map((i) =>
        i.storeStockId === stockId ? { ...i, minSellPriceUgx: val } : i,
      ),
    )
  }

  const allMinPricesValid = selectedItems.every((i) => {
    const n = new BigNumber(i.minSellPriceUgx || 0)
    return n.isFinite() && n.gt(0)
  })

  async function handleSubmit() {
    if (!shopId || selectedItems.length === 0) return
    if (!allMinPricesValid) return
    setPending(true)
    try {
      await createTransfer({
        data: {
          shopId,
          items: selectedItems.map((i) => ({
            storeStockId: i.storeStockId,
            quantityDispatched: i.qty,
            minimumSellPriceUgx: i.minSellPriceUgx,
          })),
        },
      })
      onSuccess(shopId)
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
                  className="space-y-3 p-3 border-b last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={!!selected}
                      onChange={() => toggleItem(s.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.variant.color.item.name}
                      </p>
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                        <span
                          className="size-3 rounded-full border"
                          style={{ backgroundColor: s.variant.color.colorHex }}
                          aria-hidden
                        />
                        {s.variant.color.colorName} · {s.variant.size}
                        <span className="ml-1 font-mono">
                          [{s.variant.color.item.articleNumber}]
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Available: {s.quantityOnHand} | Cost:{" "}
                        {formatUgx(s.costPerUnitUgx)}
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
                  {selected && (
                    <div className="ml-7 space-y-1">
                      <Label
                        htmlFor={`min-sell-${s.id}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        Shop Min Sell Price (UGX)
                        <InfoTip term="transferItem.minSellPrice" />
                      </Label>
                      <MoneyInput
                        id={`min-sell-${s.id}`}
                        currency="UGX"
                        roundTo={50}
                        value={selected.minSellPriceUgx}
                        onChange={(val) => setMinSellPrice(s.id, val)}
                        placeholder="0"
                        error={
                          new BigNumber(selected.minSellPriceUgx || 0).lte(0)
                            ? "Required"
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => { void handleSubmit() }}
        disabled={
          pending ||
          !shopId ||
          selectedItems.length === 0 ||
          !allMinPricesValid
        }
      >
        {pending ? "Creating..." : `Dispatch ${selectedItems.length} items`}
      </Button>
    </div>
  )
}


