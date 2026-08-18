// src/components/pos/variant-picker-sheet.tsx
import * as React from 'react'
import BigNumber from 'bignumber.js'
import { ArrowLeft, ArrowRight, Plus, Minus } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { InfoPopover } from '#/components/ui/info-popover'
import { useCart } from '#/components/pos/cart-context'
import { itemImageUrl } from '#/lib/items'
import { formatUgx, formatUgxTotal } from '#/lib/format'
import { cn } from '#/lib/utils'
import type { AggregatedItem } from '#/lib/items'
import { deriveSizes } from '#/lib/variants'
import { formatItemArticleNumbers } from '#/lib/items/article-number'

type StockRow = {
  id: string
  itemId: string
  variantId: string | null
  itemColorId: string
  size: string
  quantityOnHand: number
  minimumSellPriceUgx: string
}

type Props = {
  item: AggregatedItem | null
  stock: StockRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 1 | 2 | 3

export function VariantPickerSheet({ item, stock, open, onOpenChange }: Props) {
  const { add } = useCart()
  const [step, setStep] = React.useState<Step>(1)
  const [colorId, setColorId] = React.useState<string | null>(null)
  const [size, setSize] = React.useState<string | null>(null)
  const [qty, setQty] = React.useState(1)
  const [price, setPrice] = React.useState('')
  const [reason, setReason] = React.useState('')

  // All useEffect hooks must be called unconditionally before any early returns.
  React.useEffect(() => {
    if (!open) return
    setStep(1)
    setColorId(null)
    setSize(null)
    setQty(1)
    setPrice('')
    setReason('')
  }, [open, item?.item.id])

  // currentRow is derived below, but we need the id for the effect dep.
  // Compute it eagerly so we can reference it before the early return.
  const variantRow = React.useCallback(
    (cid: string | null, sz: string | null) =>
      cid && sz
        ? (stock.find((s) => s.itemColorId === cid && s.size === sz) ?? null)
        : null,
    [stock],
  )
  const currentRow = variantRow(colorId, size)

  React.useEffect(() => {
    if (!currentRow) return
    if (price === '') setPrice(currentRow.minimumSellPriceUgx)
  }, [currentRow, price])

  const availableColors = item?.colors ?? []
  // Sizes used to come from `items.sizes`; after #7 they're derived
  // from the materialised variants attached to the AggregatedItem
  // entry. Falls back to an empty list when the item has no stock.
  const availableSizes = deriveSizes(item?.variants ?? [])
  const stockForColor = (cid: string) =>
    stock.filter((s) => s.itemColorId === cid && s.quantityOnHand > 0)
  const sizeAvailableForColor = (cid: string, sz: string) => {
    const r = stock.find((s) => s.itemColorId === cid && s.size === sz)
    return r ? r.quantityOnHand > 0 : false
  }

  function pickColor(cid: string) {
    setColorId(cid)
    setSize(null)
    setQty(1)
    setPrice('')
    setReason('')
    setStep(2)
  }

  function pickSize(sz: string) {
    setSize(sz)
    setStep(3)
  }

  function addItem() {
    if (!currentRow || !colorId || !size || !item) return
    const color = item.colors.find((c) => c.id === colorId)
    if (!color) return
    const label = `${formatItemArticleNumbers(item.item.articleNumbers)} · ${item.item.name} — ${color.colorName} / ${size}`
    add({
      shopStockId: currentRow.id,
      itemId: currentRow.itemId,
      variantId: currentRow.variantId,
      itemLabel: label,
      imageUrl: color.imageS3Key ? itemImageUrl(color.imageS3Key) : null,
      colorHex: color.colorHex,
      qty,
      unitPriceUgx: price,
      minimumSellPriceUgx: currentRow.minimumSellPriceUgx,
      belowMinimumReason: reason.trim(),
      availableQty: currentRow.quantityOnHand,
    })
    onOpenChange(false)
  }

  const min = currentRow
    ? new BigNumber(currentRow.minimumSellPriceUgx)
    : new BigNumber(0)
  const priceBn = new BigNumber(price || 0)
  const isBelowMin = currentRow != null && priceBn.gt(0) && priceBn.lt(min)
  const canAdd =
    !!currentRow &&
    qty >= 1 &&
    priceBn.gt(0) &&
    (!isBelowMin || reason.trim().length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {item
              ? `${item.item.name} · ${formatItemArticleNumbers(item.item.articleNumbers)}`
              : ''}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 3</p>
        </SheetHeader>

        {step === 1 && (
          <div className="space-y-3 px-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pick a color
            </p>
            <div className="grid grid-cols-4 gap-3">
              {availableColors.map((c) => {
                const hasStock = stockForColor(c.id).length > 0
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!hasStock}
                    onClick={() => pickColor(c.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2 disabled:opacity-30',
                      colorId === c.id && 'border-foreground',
                    )}
                  >
                    <span
                      className="size-10 rounded-md border"
                      style={{ backgroundColor: c.colorHex }}
                      aria-hidden
                    />
                    <span className="truncate text-xs">{c.colorName}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 2 && colorId && (
          <div className="space-y-3 px-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pick a size
            </p>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map((sz) => {
                const avail = sizeAvailableForColor(colorId, sz)
                return (
                  <button
                    key={sz}
                    type="button"
                    disabled={!avail}
                    onClick={() => pickSize(sz)}
                    className={cn(
                      'h-11 min-w-[3.5rem] rounded-lg border px-4 font-semibold disabled:line-through disabled:opacity-30',
                      size === sz &&
                        'border-foreground bg-foreground text-background',
                    )}
                  >
                    {sz}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 3 && currentRow && (
          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <Label>Quantity ({currentRow.quantityOnHand} in stock)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-11"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  className="h-11 w-20 text-center text-base"
                  value={qty}
                  min={1}
                  max={currentRow.quantityOnHand}
                  onChange={(e) =>
                    setQty(
                      Math.max(
                        1,
                        Math.min(
                          currentRow.quantityOnHand,
                          Number(e.target.value) || 1,
                        ),
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-11"
                  onClick={() =>
                    setQty((q) => Math.min(currentRow.quantityOnHand, q + 1))
                  }
                  disabled={qty >= currentRow.quantityOnHand}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Price per unit (min {formatUgx(currentRow.minimumSellPriceUgx)})
              </Label>
              <MoneyInput
                currency="UGX"
                roundTo={50}
                className="h-11 text-base"
                value={price}
                onChange={setPrice}
              />
            </div>

            {isBelowMin && (
              <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <Label className="flex items-center gap-1 text-xs text-amber-900">
                  Reason for selling below{' '}
                  {formatUgx(currentRow.minimumSellPriceUgx)}
                  <InfoPopover term="pos.belowMin" />
                </Label>
                <Input
                  className="h-10 bg-background text-sm"
                  placeholder="e.g. customer haggled"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-0 mt-4 flex gap-2 border-t bg-background px-4 py-3">
          {step > 1 && (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              <ArrowLeft className="mr-1 size-4" /> Back
            </Button>
          )}
          {step < 3 && (
            <Button
              className="h-11 flex-1"
              disabled={step === 1 ? !colorId : !size}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Next <ArrowRight className="ml-1 size-4" />
            </Button>
          )}
          {step === 3 && (
            <Button
              className="h-11 flex-1 bg-green-600 text-white hover:bg-green-700"
              disabled={!canAdd}
              onClick={addItem}
            >
              Add · {formatUgxTotal(priceBn.times(qty))}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
