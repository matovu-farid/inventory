import { describe, it, expect } from "vitest"
import { buildStoreReturnReceiveEntries } from "#/server/functions/store/return-entries"
import type { JournalEntry } from "#/server/functions/store/return-entries"

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
  it("balances when margin > 0 (transfer price > cost)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "8000",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances when margin = 0 (transfer price equals cost)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "10000",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })

  it("balances when margin < 0 (transfer price below cost)", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "12000",
      totalTransferPrice: "10000",
    })
    const { dr, cr } = totals(entries)
    expect(dr).toBe(cr)
  })
})

describe("buildStoreReturnReceiveEntries — leg structure", () => {
  it("posts DR Inventory - Store for received cost", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "6000",
      totalTransferPrice: "10000",
    })
    const leg = findEntry(entries, "debit", "Inventory - Store")
    expect(leg?.amount).toBe("6000.00")
  })

  it("posts CR Inventory - Shop at totalTransferPrice", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "8000",
      totalTransferPrice: "10000",
    })
    const leg = findEntry(entries, "credit", "Inventory - Shop")
    expect(leg?.amount).toBe("10000.00")
  })

  it("posts DR Due to Store / CR Due from Shop at totalTransferPrice", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "8000",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "debit", "Due to Store")?.amount).toBe("10000.00")
    expect(findEntry(entries, "credit", "Due from Shop")?.amount).toBe("10000.00")
  })

  it("omits Store Transfer Revenue leg when margin = 0", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "10000",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "debit", "Store Transfer Revenue")).toBeUndefined()
    expect(findEntry(entries, "credit", "Store Transfer Revenue")).toBeUndefined()
  })

  it("includes DR Store Transfer Revenue when margin > 0", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "8000",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "debit", "Store Transfer Revenue")?.amount).toBe(
      "2000.00",
    )
  })

  it("includes CR Store Transfer Revenue when margin < 0", () => {
    const { entries } = buildStoreReturnReceiveEntries({
      totalCost: "12000",
      totalTransferPrice: "10000",
    })
    expect(findEntry(entries, "credit", "Store Transfer Revenue")?.amount).toBe(
      "2000.00",
    )
  })
})
