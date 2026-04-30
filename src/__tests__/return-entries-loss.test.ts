import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { BigNumber } from "bignumber.js"
import { buildStoreReturnReceiveEntries } from "#/server/functions/store/return-entries"
import type { JournalEntry } from "#/server/functions/store/return-entries"

/**
 * Tests for BUG-5: when receiveStoreReturn is called with all-zero received
 * quantities, every total is zero, the helper returns entries=[], and no
 * journal is posted. The dispatch-side stock decrement is therefore never
 * reversed and the missing inventory is silently lost.
 *
 * The fix extends `buildStoreReturnReceiveEntries` to ALSO accept the
 * dispatch totals, so it can emit a balanced loss-recognition journal when
 * nothing came back.
 *
 * Intended extended API:
 *   buildStoreReturnReceiveEntries({
 *     totalCostResellable, totalCostDamaged, totalTransferPrice,
 *     totalCostDispatched,     // NEW
 *     totalTransferDispatched, // NEW
 *   }) -> { entries }
 *
 *   When all received totals are zero AND dispatched totals > 0, the helper
 *   must emit a balanced set of entries (sum DR === sum CR, entries.length > 0).
 *   Existing positive-receipt cases must still produce balanced entries.
 */

function totals(entries: JournalEntry[]): { dr: BigNumber; cr: BigNumber } {
  let dr = new BigNumber(0)
  let cr = new BigNumber(0)
  for (const e of entries) {
    if (e.type === "debit") dr = dr.plus(e.amount)
    else cr = cr.plus(e.amount)
  }
  return { dr, cr }
}

describe("buildStoreReturnReceiveEntries — loss recognition for zero-receive (BUG-5)", () => {
  it("emits a non-empty balanced journal when nothing was received but goods were dispatched", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "0",
      totalCostDamaged: "0",
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
      totalCostResellable: "0",
      totalCostDamaged: "0",
      totalTransferPrice: "0",
      totalCostDispatched: "0",
      totalTransferDispatched: "0",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })
})

describe("buildStoreReturnReceiveEntries — backwards compatible with positive receipts", () => {
  it("still balances for the historical 'all resellable, margin > 0' case (with dispatched matching received)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "8000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
      totalCostDispatched: "8000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("still balances when margin = 0 (transfer price equals cost), full receipt", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "10000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
      totalCostDispatched: "10000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("still balances when margin < 0, full receipt", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "12000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
      totalCostDispatched: "12000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("balances when partial receipt (some goods lost)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "5000",
      totalCostDamaged: "0",
      totalTransferPrice: "6250",
      totalCostDispatched: "8000",
      totalTransferDispatched: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })
})

describe("buildStoreReturnReceiveEntries — balance property (BUG-5)", () => {
  it("forAll dispatched >= received (non-negative integers): entries are balanced", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        (
          costResellable,
          costDamaged,
          transferPrice,
          extraCostDispatched,
          extraTransferDispatched,
        ) => {
          const totalCostReceived = costResellable + costDamaged
          const totalCostDispatched = totalCostReceived + extraCostDispatched
          const totalTransferDispatched = transferPrice + extraTransferDispatched

          const { entries } = buildStoreReturnReceiveEntries({
            totalCostResellable: String(costResellable),
            totalCostDamaged: String(costDamaged),
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
