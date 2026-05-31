import { Trash2, Plus, Minus, ArrowRight } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
import { Button } from "#/components/ui/button"
import { useCart } from "#/components/pos/cart-context"
import { computeTotal } from "#/lib/pos/cart-reducer"
import { formatUgxTotal } from "#/lib/format"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCheckout: () => void
}

export function CartSheet({ open, onOpenChange, onCheckout }: Props) {
  const { state, remove, updateQty } = useCart()
  const total = computeTotal(state.items)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Cart · {state.items.length} {state.items.length === 1 ? "item" : "items"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-4">
          {state.items.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">Your cart is empty.</p>
          )}
          {state.items.map((i) => (
            <div key={i.shopStockId} className="flex items-center gap-3 rounded-lg border p-3">
              <div
                className="size-12 shrink-0 rounded-md border"
                style={{ backgroundColor: i.colorHex }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.itemLabel}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {i.qty} × {formatUgxTotal(i.unitPriceUgx)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() => updateQty(i.shopStockId, i.qty - 1)}
                  disabled={i.qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-5 text-center text-sm font-semibold">{i.qty}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-9"
                  onClick={() => updateQty(i.shopStockId, i.qty + 1)}
                  disabled={i.qty >= i.availableQty}
                  aria-label="Increase quantity"
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i.shopStockId)}
                  aria-label={`Remove ${i.itemLabel}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {state.items.length > 0 && (
          <div className="sticky bottom-0 space-y-3 border-t bg-background px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-mono text-xl font-bold">{formatUgxTotal(total)}</span>
            </div>
            <Button className="h-12 w-full text-base" onClick={onCheckout}>
              Checkout <ArrowRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
