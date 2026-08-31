import { describe, expect, it } from 'vitest'
import { buildCsv } from '#/lib/report-export'

describe('report CSV export', () => {
  it('serializes headers and rows with RFC-style escaping', () => {
    expect(
      buildCsv(
        ['Account', 'Description', 'Amount'],
        [
          ['Cash', 'Till, front', 12500],
          ['Bank', 'He said "deposit"', '50000'],
          ['Other', 'Line one\nLine two', null],
        ],
      ),
    ).toBe(
      'Account,Description,Amount\n' +
        'Cash,"Till, front",12500\n' +
        'Bank,"He said ""deposit""",50000\n' +
        'Other,"Line one\nLine two",\n',
    )
  })

  it('normalizes missing values to empty CSV fields', () => {
    expect(buildCsv(['A', 'B'], [[undefined, false]])).toBe('A,B\n,false\n')
  })
})
