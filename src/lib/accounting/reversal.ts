export interface OriginalEntry {
  type: 'debit' | 'credit'
  amount: string
  categoryId: string
  locationType: 'store' | 'shop'
  locationId: string
  bankAccountId: string | null
  depositLocation: 'cash' | 'bank' | null
  referenceType: string | null
  referenceId: string | null
  description: string | null
}

/**
 * Minimal shape of a `transactions` row used by the reversibility guard.
 * Kept narrow so callers (and tests) can construct fixtures without hauling
 * in every column on the table.
 */
export interface TransactionRow {
  id: string
  journalGroupId: string
  type: 'debit' | 'credit'
  amount: string
  categoryId: string
  reversedByJournalGroupId: string | null
}

/**
 * Throws if a journal group cannot be safely reversed:
 *   - the entry list is empty (no group / not found)
 *   - any leg already has a `reversedByJournalGroupId`
 *
 * Returns void on success.
 */
export function assertReversible(entries: TransactionRow[]): void {
  if (entries.length === 0) {
    throw new Error('assertReversible: journal group is empty (not found)')
  }
  const alreadyReversed = entries.find(
    (e) => e.reversedByJournalGroupId !== null,
  )
  if (alreadyReversed) {
    throw new Error(
      `assertReversible: journal group ${alreadyReversed.journalGroupId} is already reversed by ${alreadyReversed.reversedByJournalGroupId}`,
    )
  }
}

export interface ReversalEntry extends OriginalEntry {
  recordedBy: string
}

export interface ReversalParams {
  reason: string
  recordedBy: string
}

export function buildReversalEntries(
  entries: OriginalEntry[],
  params: ReversalParams,
): ReversalEntry[] {
  if (entries.length === 0) {
    throw new Error('reversal: cannot reverse an empty entry list')
  }
  if (!params.reason) throw new Error('reversal: reason required')
  if (!params.recordedBy) throw new Error('reversal: recordedBy required')

  return entries.map((entry) => ({
    ...entry,
    type: entry.type === 'debit' ? 'credit' : 'debit',
    referenceType: 'reversal',
    description: `Reversal: ${params.reason}`,
    recordedBy: params.recordedBy,
  }))
}
