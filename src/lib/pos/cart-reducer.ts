import BigNumber from "bignumber.js"

export type CartItem = {
  shopStockId: string
  productLabel: string
  imageUrl: string | null
  colorHex: string
  qty: number
  unitPriceUgx: string
  minimumSellPriceUgx: string
  belowMinimumReason: string
  availableQty: number
}

export type CartState = { items: CartItem[] }

export type CartAction =
  | { type: "add"; item: CartItem }
  | { type: "remove"; shopStockId: string }
  | { type: "updateQty"; shopStockId: string; qty: number }
  | { type: "updatePrice"; shopStockId: string; unitPriceUgx: string }
  | { type: "updateReason"; shopStockId: string; reason: string }
  | { type: "clear" }
  | { type: "hydrate"; state: CartState }

export const initialCart: CartState = { items: [] }

function clampQty(qty: number, available: number): number {
  if (!Number.isFinite(qty) || qty < 1) return 1
  return Math.min(qty, Math.max(1, available))
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const existing = state.items.find((i) => i.shopStockId === action.item.shopStockId)
      if (existing) {
        const mergedQty = clampQty(existing.qty + action.item.qty, existing.availableQty)
        return {
          items: state.items.map((i) =>
            i.shopStockId === action.item.shopStockId ? { ...i, qty: mergedQty } : i,
          ),
        }
      }
      return { items: [...state.items, { ...action.item, qty: clampQty(action.item.qty, action.item.availableQty) }] }
    }
    case "remove":
      return { items: state.items.filter((i) => i.shopStockId !== action.shopStockId) }
    case "updateQty":
      return {
        items: state.items.map((i) =>
          i.shopStockId === action.shopStockId ? { ...i, qty: clampQty(action.qty, i.availableQty) } : i,
        ),
      }
    case "updatePrice":
      return {
        items: state.items.map((i) =>
          i.shopStockId === action.shopStockId ? { ...i, unitPriceUgx: action.unitPriceUgx } : i,
        ),
      }
    case "updateReason":
      return {
        items: state.items.map((i) =>
          i.shopStockId === action.shopStockId ? { ...i, belowMinimumReason: action.reason } : i,
        ),
      }
    case "clear":
      return initialCart
    case "hydrate":
      return action.state
  }
}

export function computeTotal(items: CartItem[]): BigNumber {
  return items.reduce(
    (sum, i) => sum.plus(new BigNumber(i.unitPriceUgx || 0).times(i.qty)),
    new BigNumber(0),
  )
}

export function isBelowMin(item: CartItem): boolean {
  return new BigNumber(item.unitPriceUgx || 0).lt(item.minimumSellPriceUgx)
}
