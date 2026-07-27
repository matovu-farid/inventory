import BigNumber from 'bignumber.js'

export interface JournalEntry {
  type: 'debit' | 'credit'
  category: string
  amount: string
}

export interface BuildTransferInventoryEntriesInput {
  totalTransferValue: string
  totalCostValue: string
}

export interface BuildTransferInventoryEntriesResult {
  entries: JournalEntry[]
}

/**
 * Build the inventory-shift journal entries for a store -> shop transfer.
 *
 * Always emits:
 *   DR Inventory - Shop  (totalTransferValue)
 *   CR Inventory - Store (totalCostValue)
 *
 * Plus a balancing leg based on margin = transferValue - costValue:
 *   margin > 0 -> CR Store Transfer Revenue (margin)
 *   margin < 0 -> DR Store Transfer Loss    (abs(margin))
 *   margin = 0 -> nothing extra
 *
 * The result is always balanced: sum(DR) === sum(CR).
 */
export function buildTransferInventoryEntries(
  input: BuildTransferInventoryEntriesInput,
): BuildTransferInventoryEntriesResult {
  const transferValue = new BigNumber(input.totalTransferValue)
  const costValue = new BigNumber(input.totalCostValue)
  const margin = transferValue.minus(costValue)

  const entries: JournalEntry[] = [
    {
      type: 'debit',
      category: 'Inventory - Shop',
      amount: transferValue.toFixed(2),
    },
    {
      type: 'credit',
      category: 'Inventory - Store',
      amount: costValue.toFixed(2),
    },
  ]

  if (margin.gt(0)) {
    entries.push({
      type: 'credit',
      category: 'Store Transfer Revenue',
      amount: margin.toFixed(2),
    })
  } else if (margin.lt(0)) {
    entries.push({
      type: 'debit',
      category: 'Store Transfer Loss',
      amount: margin.abs().toFixed(2),
    })
  }

  return { entries }
}
