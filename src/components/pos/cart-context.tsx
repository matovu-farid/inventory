import * as React from "react"
import {
  cartReducer,
  initialCart,
  type CartState,
  type CartItem,
} from "#/lib/pos/cart-reducer"

type CartCtx = {
  state: CartState
  add: (item: CartItem) => void
  remove: (shopStockId: string) => void
  updateQty: (shopStockId: string, qty: number) => void
  updatePrice: (shopStockId: string, unitPriceUgx: string) => void
  updateReason: (shopStockId: string, reason: string) => void
  clear: () => void
}

const Ctx = React.createContext<CartCtx | null>(null)

export function CartProvider({
  storageKey,
  children,
}: {
  storageKey: string
  children: React.ReactNode
}) {
  const [state, dispatch] = React.useReducer(cartReducer, initialCart)
  const hydrated = React.useRef(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const raw = window.localStorage.getItem(storageKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as CartState
        if (parsed && Array.isArray(parsed.items)) {
          dispatch({ type: "hydrate", state: parsed })
        }
      } catch {
        // ignore corrupt storage
      }
    }
    hydrated.current = true
  }, [storageKey])

  React.useEffect(() => {
    if (!hydrated.current || typeof window === "undefined") return
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, [storageKey, state])

  const value = React.useMemo<CartCtx>(
    () => ({
      state,
      add: (item) => dispatch({ type: "add", item }),
      remove: (shopStockId) => dispatch({ type: "remove", shopStockId }),
      updateQty: (shopStockId, qty) => dispatch({ type: "updateQty", shopStockId, qty }),
      updatePrice: (shopStockId, unitPriceUgx) =>
        dispatch({ type: "updatePrice", shopStockId, unitPriceUgx }),
      updateReason: (shopStockId, reason) => dispatch({ type: "updateReason", shopStockId, reason }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [state],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartCtx {
  const v = React.useContext(Ctx)
  if (!v) throw new Error("useCart must be used inside CartProvider")
  return v
}
