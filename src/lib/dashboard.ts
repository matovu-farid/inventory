import BigNumber from 'bignumber.js'

export type DashboardSalesDay = {
  date: string
  /** Numeric value for chart coordinates; use revenueUgx for monetary totals. */
  revenue: number
  revenueUgx: string
  sales: number
}

export type DashboardOverview = {
  asOfDate: string
  salesSeries: Array<DashboardSalesDay>
  summary: {
    warehouseUnits: number | null
    shopUnits: number
    catalogItems: number
    /** Transfers pending dispatch or awaiting shop receipt. */
    pendingTransfers: number
  }
  locations: Array<{
    name: string
    kind: 'warehouse' | 'shop'
    quantity: number
  }>
  recentSales: Array<{
    id: string
    reference: string
    shopName: string
    soldAt: string
    totalAmountUgx: string
    paymentMethod: string
  }>
  /** Open alerts for the caller's visible location scopes. */
  lowStockCount: number
  lowStockLocations: Array<{
    scope: 'store' | 'shop'
    locationId: string
    name: string
    count: number
  }>
  openSupplyRoutes: number | null
}

export function getDashboardDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function fillDashboardSalesSeries(
  asOfDate: string,
  rows: Array<{ date: string; revenueUgx: string; sales: number }>,
): Array<DashboardSalesDay> {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return Array.from({ length: 90 }, (_, index) => {
    const date = shiftDate(asOfDate, index - 89)
    const row = byDate.get(date)
    const revenueUgx = new BigNumber(row?.revenueUgx ?? 0).toFixed(2)
    return {
      date,
      revenue: Number(revenueUgx),
      revenueUgx,
      sales: row?.sales ?? 0,
    }
  })
}

export function getDashboardPeriod(
  series: Array<DashboardSalesDay>,
  days: number,
  asOfDate: string,
): { series: Array<DashboardSalesDay>; revenueUgx: string; sales: number } {
  const startDate = shiftDate(asOfDate, -(days - 1))
  const selected = series.filter(
    (day) => day.date >= startDate && day.date <= asOfDate,
  )
  return {
    series: selected,
    revenueUgx: selected
      .reduce((sum, day) => sum.plus(day.revenueUgx), new BigNumber(0))
      .toFixed(2),
    sales: selected.reduce((sum, day) => sum + day.sales, 0),
  }
}
