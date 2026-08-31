import { describe, expect, it } from 'vitest'
import {
  formatReportPeriod,
  parseReportDate,
  reportDateRangeSchema,
} from '#/lib/report-date-range'

describe('report date range', () => {
  it('parses date-only start and end boundaries in UTC', () => {
    expect(parseReportDate('2026-08-31', 'start')?.toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    )
    expect(parseReportDate('2026-08-31', 'end')?.toISOString()).toBe(
      '2026-08-31T23:59:59.999Z',
    )
  })

  it('rejects malformed or impossible date values', () => {
    expect(parseReportDate(undefined, 'start')).toBeUndefined()
    expect(parseReportDate('2026-8-1', 'start')).toBeUndefined()
    expect(parseReportDate('2026-02-30', 'start')).toBeUndefined()
  })

  it('describes all supported period combinations', () => {
    expect(formatReportPeriod()).toBe('All dates')
    expect(formatReportPeriod('2026-08-01')).toBe('From 2026-08-01')
    expect(formatReportPeriod(undefined, '2026-08-31')).toBe(
      'Through 2026-08-31',
    )
    expect(formatReportPeriod('2026-08-01', '2026-08-31')).toBe(
      '2026-08-01 to 2026-08-31',
    )
  })

  it('rejects an inverted validated report range', () => {
    expect(
      reportDateRangeSchema.safeParse({
        from: '2026-08-31',
        to: '2026-08-01',
      }).success,
    ).toBe(false)
  })
})
