import { ShoppingCart } from "lucide-react"
import { useCart } from "#/components/pos/cart-context"
import { computeTotal } from "#/lib/pos/cart-reducer"
import { formatUgxTotal } from "#/lib/format"

type Props = {
  onOpenCart: () => void
}

export function CartBar({ onOpenCart }: Props) {
  const { state } = useCart()
  const count = state.items.reduce((s, i) => s + i.qty, 0)
  const total = computeTotal(state.items)
  if (state.items.length === 0) return null
  return (
    <div className="sticky bottom-0 z-20 border-t bg-background">
      <button
        type="button"
        onClick={onOpenCart}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 active:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <ShoppingCart className="size-5" strokeWidth={1.75} />
          <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
            {count}
          </span>
          <span className="text-sm font-medium">View cart</span>
        </span>
        <span className="font-mono text-base font-bold">{formatUgxTotal(total)}</span>
      </button>
    </div>
  )
}
