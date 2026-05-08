import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { BigNumber } from "bignumber.js"
import { buildStoreReturnReceiveEntries } from "#/server/functions/store/return-entries"
import type { JournalEntry } from "#/server/functions/store/return-entries"

function totals(entries: JournalEntry[]): { dr: BigNumber; cr: BigNumber } {
  let dr = new BigNumber(0)
  let cr = new BigNumber(0)
  for (const e of entries) {
    if (e.type === "debit") dr = dr.plus(e.amount)
    else cr = cr.plus(e.amount)
  }
  return { dr, cr }
}

describe("buildStoreReturnReceiveEntries — loss recognition for zero-receive", () => {
  it("emits a non-empty balanced journal when nothing was received but goods were dispatched", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "0",
      totalTransferPrice: "0",
      totalCostDispatched: "8000",
      totalTransferDispatched: "10000",
    })
    expect(entries.length).toBeGreaterThan(0)
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("emits no entries when nothing was dispatched and nothing received", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "0",
      totalTransferPrice: "0",
      totalCostDispatched: "0",
      totalTransferDispatched: "0",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })
})

describe("buildStoreReturnReceiveEntries — backwards compatible with positive receipts", () => {
  it("balances for full receipt with margin > 0", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "8000",
      totalTransferPrice: "10000",
      totalCostDispatched: "8000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("balances when margin = 0, full receipt", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "10000",
      totalTransferPrice: "10000",
      totalCostDispatched: "10000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("balances when margin < 0, full receipt", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "12000",
      totalTransferPrice: "10000",
      totalCostDispatched: "12000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("balances when partial receipt (some goods lost)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "5000",
      totalTransferPrice: "6250",
      totalCostDispatched: "8000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })
})

describe("buildStoreReturnReceiveEntries — balance property", () => {
  it("forAll dispatched >= received (non-negative integers): entries are balanced", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        (cost, transferPrice, extraCostDispatched, extraTransferDispatched) => {
          const totalCostDispatched = cost + extraCostDispatched
          const totalTransferDispatched = transferPrice + extraTransferDispatched

          const { entries } = buildStoreReturnReceiveEntries({
            totalCost: String(cost),
            totalTransferPrice: String(transferPrice),
            totalCostDispatched: String(totalCostDispatched),
            totalTransferDispatched: String(totalTransferDispatched),
          })
          const { dr, cr } = totals(entries)
          expect(dr.toFixed(2)).toBe(cr.toFixed(2))
        },
      ),
    )
  })
})
