import { describe, it, expect } from 'vitest'
import { assertReversible } from '#/lib/accounting/reversal'
import type { TransactionRow } from '#/lib/accounting/reversal'

/**
 * Tests for BUG-4: reverseJournalEntry has a TOCTOU race — two concurrent
 * reversal calls on the same group can both pass the "already reversed"
 * guard. The fix in the actual implementation will use SELECT ... FOR UPDATE,
 * but the assertion logic itself is testable as a pure helper.
 *
 * Intended pure-helper API:
 *   assertReversible(entries: TransactionRow[]): void
 *     - Throws if entries is empty
 *     - Throws if any leg has reversedByJournalGroupId !== null
 *     - Returns void (no return value) when reversible
 */

const okEntry: TransactionRow = {
  id: 'tx-1',
  journalGroupId: 'jg-1',
  type: 'debit',
  amount: '10000',
  categoryId: 'cat-1',
  reversedByJournalGroupId: null,
}

const reversedEntry: TransactionRow = {
  id: 'tx-2',
  journalGroupId: 'jg-1',
  type: 'credit',
  amount: '10000',
  categoryId: 'cat-2',
  reversedByJournalGroupId: 'jg-reversal-99',
}

describe('assertReversible', () => {
  it('does not throw for a clean group (no reversedByJournalGroupId set)', () => {
    expect(() =>
      assertReversible([
        okEntry,
        { ...okEntry, id: 'tx-2', type: 'credit', categoryId: 'cat-2' },
      ]),
    ).not.toThrow()
  })

  it('throws for a single-leg already-reversed group', () => {
    expect(() => assertReversible([reversedEntry])).toThrow(/already reversed/i)
  })

  it('throws for a multi-leg group where any leg is already reversed', () => {
    expect(() => assertReversible([okEntry, reversedEntry])).toThrow(
      /already reversed/i,
    )
  })

  it('includes the reversing journal group id in the error message for traceability', () => {
    expect(() => assertReversible([reversedEntry])).toThrow(/jg-reversal-99/)
  })

  it('throws for an empty entry list', () => {
    expect(() => assertReversible([])).toThrow(/(empty|not found)/i)
  })
})
