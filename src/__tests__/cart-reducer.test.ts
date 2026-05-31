import { describe, it, expect } from "vitest"
import BigNumber from "bignumber.js"
import { cartReducer, computeTotal, initialCart  } from "#/lib/pos/cart-reducer"
import type {CartItem} from "#/lib/pos/cart-reducer";

const item: CartItem = {
  shopStockId: "stk1",
  itemLabel: "TR-001 · Crew Tee",
  imageUrl: null,
  colorHex: "#dc2626",
  qty: 1,
  unitPriceUgx: "50000",
  minimumSellPriceUgx: "50000",
  belowMinimumReason: "",
  availableQty: 10,
}

describe("cartReducer", () => {
  it("starts empty", () => {
    expect(initialCart.items).toEqual([])
  })

  it("adds an item", () => {
    const s = cartReducer(initialCart, { type: "add", item })
    expect(s.items).toHaveLength(1)
    expect(s.items[0].shopStockId).toBe("stk1")
  })

  it("deduplicates by shopStockId (merges qty)", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "add", item: { ...item, qty: 2 } })
    expect(s2.items).toHaveLength(1)
    expect(s2.items[0].qty).toBe(3)
  })

  it("clamps qty to availableQty when merging", () => {
    const s1 = cartReducer(initialCart, { type: "add", item: { ...item, qty: 8 } })
    const s2 = cartReducer(s1, { type: "add", item: { ...item, qty: 5 } })
    expect(s2.items[0].qty).toBe(10)
  })

  it("removes an item", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "remove", shopStockId: "stk1" })
    expect(s2.items).toHaveLength(0)
  })

  it("updates qty (clamped 1..availableQty)", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "updateQty", shopStockId: "stk1", qty: 99 })
    expect(s2.items[0].qty).toBe(10)
    const s3 = cartReducer(s2, { type: "updateQty", shopStockId: "stk1", qty: 0 })
    expect(s3.items[0].qty).toBe(1)
  })

  it("updates price and reason", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    const s2 = cartReducer(s1, { type: "updatePrice", shopStockId: "stk1", unitPriceUgx: "40000" })
    expect(s2.items[0].unitPriceUgx).toBe("40000")
    const s3 = cartReducer(s2, { type: "updateReason", shopStockId: "stk1", reason: "haggled" })
    expect(s3.items[0].belowMinimumReason).toBe("haggled")
  })

  it("clears the cart", () => {
    const s1 = cartReducer(initialCart, { type: "add", item })
    expect(cartReducer(s1, { type: "clear" }).items).toEqual([])
  })

  it("computes total with BigNumber", () => {
    const s = cartReducer(initialCart, { type: "add", item: { ...item, qty: 2, unitPriceUgx: "40000" } })
    expect(computeTotal(s.items).toFixed(0)).toBe("80000")
  })

  it("computeTotal returns zero for empty cart", () => {
    expect(computeTotal([]).eq(new BigNumber(0))).toBe(true)
  })
})
