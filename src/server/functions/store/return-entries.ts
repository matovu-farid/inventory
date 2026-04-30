import BigNumber from "bignumber.js"

export interface JournalEntry {
  type: "debit" | "credit"
  category: string
  amount: string
}

export interface BuildStoreReturnReceiveEntriesInput {
  totalCostResellable: string
  totalCostDamaged: string
  totalTransferPrice: string
}

export interface BuildStoreReturnReceiveEntriesResult {
  entries: JournalEntry[]
}

/**
 * Build the journal entries that reverse a store transfer when goods are
 * returned to the store. Always produces a balanced set (sum of debits ===
 * sum of credits).
 *
 * Legs:
 *   DR Inventory - Store           (totalCostResellable)   when > 0
 *   DR Damaged Inventory - Store   (totalCostDamaged)      when > 0
 *   CR Inventory - Shop            (totalTransferPrice)
 *   DR Due to Store                (totalTransferPrice)
 *   CR Due from Shop               (totalTransferPrice)
 *   DR Store Transfer Revenue      (margin)                when margin > 0
 *   CR Store Transfer Revenue      (-margin)               when margin < 0
 *
 *   margin = totalTransferPrice - (totalCostResellable + totalCostDamaged)
 *
 * The Store Transfer Revenue leg is what makes the entry balance:
 *   - margin > 0 means the original transfer recognised revenue, reverse with DR.
 *   - margin < 0 means the original transfer recognised a loss, reverse with CR.
 *   - margin = 0 means no revenue/loss leg is needed (the rest already balances).
 */
export function buildStoreReturnReceiveEntries(
  input: BuildStoreReturnReceiveEntriesInput,
): BuildStoreReturnReceiveEntriesResult {
  const totalCostResellable = new BigNumber(input.totalCostResellable)
  const totalCostDamaged = new BigNumber(input.totalCostDamaged)
  const totalTransferPrice = new BigNumber(input.totalTransferPrice)
  const totalCost = totalCostResellable.plus(totalCostDamaged)
  const totalMargin = totalTransferPrice.minus(totalCost)

  const entries: JournalEntry[] = []

  if (totalCostResellable.gt(0)) {
    entries.push({
      type: "debit",
      category: "Inventory - Store",
      amount: totalCostResellable.toFixed(2),
    })
  }
  if (totalCostDamaged.gt(0)) {
    entries.push({
      type: "debit",
      category: "Damaged Inventory - Store",
      amount: totalCostDamaged.toFixed(2),
    })
  }

  if (totalTransferPrice.gt(0)) {
    entries.push({
      type: "credit",
      category: "Inventory - Shop",
      amount: totalTransferPrice.toFixed(2),
    })
    entries.push({
      type: "debit",
      category: "Due to Store",
      amount: totalTransferPrice.toFixed(2),
    })
    entries.push({
      type: "credit",
      category: "Due from Shop",
      amount: totalTransferPrice.toFixed(2),
    })
  }

  if (totalMargin.gt(0)) {
    entries.push({
      type: "debit",
      category: "Store Transfer Revenue",
      amount: totalMargin.toFixed(2),
    })
  } else if (totalMargin.lt(0)) {
    entries.push({
      type: "credit",
      category: "Store Transfer Revenue",
      amount: totalMargin.abs().toFixed(2),
    })
  }

  return { entries }
}
