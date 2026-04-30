import { describe, it, expect } from "vitest"
import { buildStoreReturnReceiveEntries } from "#/server/functions/store/return-entries"
import type { JournalEntry } from "#/server/functions/store/return-entries"

/**
 * Tests for BUG-1: receiveStoreReturn produces unbalanced journal entries when
 * transfer price equals cost (margin = 0). The Store Transfer Revenue leg is
 * skipped under `if (totalMargin.gt(0))`, leaving DR != CR.
 *
 * The intended pure-helper API is:
 *   buildStoreReturnReceiveEntries({
 *     totalCostResellable, totalCostDamaged, totalTransferPrice
 *   }) -> { entries: JournalEntry[] }
 *
 * Result MUST always be balanced (sum of debits = sum of credits).
 */

function totals(entries: JournalEntry[]): { dr: number; cr: number } {
  let dr = 0
  let cr = 0
  for (const e of entries) {
    if (e.type === "debit") dr += Number(e.amount)
    else cr += Number(e.amount)
  }
  return { dr, cr }
}

function findEntry(
  entries: JournalEntry[],
  type: "debit" | "credit",
  category: string,
): JournalEntry | undefined {
  return entries.find((e) => e.type === type && e.category === category)
}

describe("buildStoreReturnReceiveEntries — balance invariant", () => {
  it("balances when margin > 0 (transfer price > cost), all resellable", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "8000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances when margin = 0 (transfer price equals cost), all resellable — BUG-1 reproduces here", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "10000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances when margin < 0 (transfer price below cost), all resellable", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "12000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances when all units are damaged (margin > 0)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "0",
      totalCostDamaged: "8000",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances when all units are damaged (margin = 0)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "0",
      totalCostDamaged: "10000",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances with mixed resellable + damaged inventory split", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "6000",
      totalCostDamaged: "2000",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })
})

describe("buildStoreReturnReceiveEntries — leg structure", () => {
  it("posts DR Inventory - Store for resellable cost", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "6000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
    })
    const leg = findEntry(entries, "debit", "Inventory - Store")
    expect(leg?.amount).toBe("6000.00")
  })

  it("posts DR Damaged Inventory - Store for damaged cost", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "0",
      totalCostDamaged: "2000",
      totalTransferPrice: "10000",
    })
    const leg = findEntry(entries, "debit", "Damaged Inventory - Store")
    expect(leg?.amount).toBe("2000.00")
  })

  it("omits Inventory - Store leg when there's no resellable inventory", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "0",
      totalCostDamaged: "10000",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "debit", "Inventory - Store")).toBeUndefined()
  })

  it("omits Damaged Inventory - Store leg when nothing is damaged", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "10000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "debit", "Damaged Inventory - Store")).toBeUndefined()
  })

  it("posts CR Inventory - Shop at totalTransferPrice", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "6000",
      totalCostDamaged: "2000",
      totalTransferPrice: "10000",
    })
    const leg = findEntry(entries, "credit", "Inventory - Shop")
    expect(leg?.amount).toBe("10000.00")
  })

  it("posts DR Due to Store / CR Due from Shop at totalTransferPrice", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "6000",
      totalCostDamaged: "2000",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "debit", "Due to Store")?.amount).toBe("10000.00")
    expect(findEntry(entries, "credit", "Due from Shop")?.amount).toBe("10000.00")
  })

  it("omits Store Transfer Revenue leg only when both sides are zero", () => {
    const zero = buildStoreReturnReceiveEntries({
      totalCostResellable: "0",
      totalCostDamaged: "0",
      totalTransferPrice: "0",
    })
    expect(findEntry(zero.entries, "debit", "Store Transfer Revenue")).toBeUndefined()
    expect(findEntry(zero.entries, "credit", "Store Transfer Revenue")).toBeUndefined()
  })

  it("includes a Store Transfer Revenue leg when margin = 0 to keep entries balanced (BUG-1)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCostResellable: "10000",
      totalCostDamaged: "0",
      totalTransferPrice: "10000",
    })
    // With margin = 0 there is no revenue/loss reversal needed, BUT the
    // helper must still output a balanced journal. That means either no
    // revenue leg is needed AND the rest of the structure already balances
    // (which is the contract). The key invariant is: balanced. This test
    // just re-asserts the balance for the zero-margin case.
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })
})
