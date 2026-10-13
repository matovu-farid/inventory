import { describe, expect, it } from 'vitest'
import {
  fillDashboardSalesSeries,
  getDashboardDate,
  getDashboardPeriod,
} from '#/lib/dashboard'

describe('dashboard calendar periods', () => {
  it('uses the Kampala calendar day across the UTC evening boundary', () => {
    expect(getDashboardDate(new Date('2026-10-12T20:59:59Z'))).toBe(
      '2026-10-12',
    )
    expect(getDashboardDate(new Date('2026-10-12T21:00:00Z'))).toBe(
      '2026-10-13',
    )
  })

  it('fills exactly 90 ascending days including leap day and today', () => {
    const series = fillDashboardSalesSeries('2024-03-01', [
      { date: '2024-02-29', revenueUgx: '1250.10', sales: 2 },
      { date: '2024-03-01', revenueUgx: '350.20', sales: 1 },
      { date: '2023-11-01', revenueUgx: '500.00', sales: 1 },
    ])
    expect(series).toHaveLength(90)
    expect(series[0]).toEqual({
      date: '2023-12-03',
      revenue: 0,
      revenueUgx: '0.00',
      sales: 0,
    })
    expect(series.at(-2)).toEqual({
      date: '2024-02-29',
      revenue: 1250.1,
      revenueUgx: '1250.10',
      sales: 2,
    })
    expect(series.at(-1)?.date).toBe('2024-03-01')
  })

  it('anchors inclusive period filters to the server date and sums exact UGX', () => {
    const series = fillDashboardSalesSeries('2026-10-13', [
      { date: '2026-10-06', revenueUgx: '10.00', sales: 8 },
      { date: '2026-10-07', revenueUgx: '0.10', sales: 1 },
      { date: '2026-10-13', revenueUgx: '0.20', sales: 2 },
    ])
    const period = getDashboardPeriod(series, 7, '2026-10-13')
    expect(period.series).toHaveLength(7)
    expect(period.series[0]?.date).toBe('2026-10-07')
    expect(period.revenueUgx).toBe('0.30')
    expect(period.sales).toBe(3)
  })
})
