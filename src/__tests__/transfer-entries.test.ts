import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { BigNumber } from "bignumber.js"
import { buildTransferInventoryEntries } from "#/server/functions/store/transfer-entries"

/**
 * Tests for BUG-4: createStoreTransfer adds the margin leg only when
 * margin.gt(0). With transferValue < costValue (margin < 0), the journal
 * has DR Inventory-Shop = transferValue and CR Inventory-Store = costValue,
 * which is unbalanced — postJournalEntry throws "Journal entry unbalanced".
 *
 * Intended pure-helper API:
 *   buildTransferInventoryEntries({ totalTransferValue, totalCostValue })
 *     -> { entries: Array<{ type, category, amount }> }
 *
 *   margin = transferValue - costValue
 *     margin > 0 → DR Inventory-Shop, CR Inventory-Store, CR Store Transfer Revenue
 *     margin = 0 → DR Inventory-Shop, CR Inventory-Store
 *     margin < 0 → DR Inventory-Shop, CR Inventory-Store, DR Store Transfer Loss
 *
 *   Always: sum(DR) === sum(CR)
 */

interface JournalEntry {
  type: "debit" | "credit"
  category: string
  amount: string
}

function totals(entries: JournalEntry[]): { dr: BigNumber; cr: BigNumber } {
  let dr = new BigNumber(0)
  let cr = new BigNumber(0)
  for (const e of entries) {
    if (e.type === "debit") dr = dr.plus(e.amount)
    else cr = cr.plus(e.amount)
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

describe("buildTransferInventoryEntries — example branches (BUG-4)", () => {
  it("margin > 0: emits DR Inventory-Shop / CR Inventory-Store / CR Store Transfer Revenue", () => {
    const { entries } = buildTransferInventoryEntries({
      totalTransferValue: "10000",
      totalCostValue: "8000",
    })
    expect(findEntry(entries, "debit", "Inventory - Shop")?.amount).toBe("10000.00")
    expect(findEntry(entries, "credit", "Inventory - Store")?.amount).toBe("8000.00")
    expect(findEntry(entries, "credit", "Store Transfer Revenue")?.amount).toBe(
      "2000.00",
    )
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("margin = 0: emits only the two inventory legs (still balanced)", () => {
    const { entries } = buildTransferInventoryEntries({
      totalTransferValue: "8000",
      totalCostValue: "8000",
    })
    expect(findEntry(entries, "debit", "Inventory - Shop")?.amount).toBe("8000.00")
    expect(findEntry(entries, "credit", "Inventory - Store")?.amount).toBe("8000.00")
    expect(
      findEntry(entries, "credit", "Store Transfer Revenue"),
    ).toBeUndefined()
    expect(findEntry(entries, "debit", "Store Transfer Loss")).toBeUndefined()
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })

  it("margin < 0: emits DR Store Transfer Loss = abs(margin) so books balance", () => {
    const { entries } = buildTransferInventoryEntries({
      totalTransferValue: "7000",
      totalCostValue: "10000",
    })
    expect(findEntry(entries, "debit", "Inventory - Shop")?.amount).toBe("7000.00")
    expect(findEntry(entries, "credit", "Inventory - Store")?.amount).toBe(
      "10000.00",
    )
    expect(findEntry(entries, "debit", "Store Transfer Loss")?.amount).toBe(
      "3000.00",
    )
    expect(
      findEntry(entries, "credit", "Store Transfer Revenue"),
    ).toBeUndefined()
    const { dr, cr } = totals(entries)
    expect(dr.toFixed(2)).toBe(cr.toFixed(2))
  })
})

describe("buildTransferInventoryEntries — balance invariant (BUG-4)", () => {
  it("forAll non-negative integer transferValue, costValue: sum(DR) === sum(CR)", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        (transferValue, costValue) => {
          const { entries } = buildTransferInventoryEntries({
            totalTransferValue: String(transferValue),
            totalCostValue: String(costValue),
          })
          const { dr, cr } = totals(entries)
          expect(dr.toFixed(2)).toBe(cr.toFixed(2))
        },
      ),
    )
  })
})
