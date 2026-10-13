import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  role: 'admin',
  query: vi.fn(),
  requireSessionAndRole: vi.fn(),
}))

vi.mock('#/db', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { Pool } = await import('pg')
  const schema = await import('#/db/schema')
  const pool = new Pool()
  Object.defineProperty(pool, 'query', { value: mocks.query })
  return { db: drizzle(pool, { schema }) }
})
vi.mock('#/server/middleware/rbac', () => ({
  requireSessionAndRole: mocks.requireSessionAndRole,
}))
// Vitest does not run Start's server-function AST transform. Keep the actual
// endpoint handler while replacing only its transport wrapper.
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: <T>(handler: () => Promise<T>) => handler,
  }),
}))

const { getDashboardOverview } =
  await import('#/server/functions/dashboard/overview')
const call = () => getDashboardOverview()

beforeEach(() => {
  mocks.role = 'admin'
  mocks.query.mockReset()
  mocks.requireSessionAndRole
    .mockReset()
    .mockImplementation((roles: string[]) => {
      if (!roles.includes(mocks.role)) throw new Error('Forbidden')
      return Promise.resolve({ user: { role: mocks.role } })
    })
  mocks.query.mockImplementation((query: { text: string }) => {
    const sql = query.text
    if (sql.includes('to_char'))
      return { rows: [['2026-10-13', '9007199254740993.10', '2']] }
    if (sql.includes('from "shop_sales"'))
      return {
        rows: [
          [
            'sale-id',
            null,
            'Main shop',
            '2026-10-12T21:30:00Z',
            '9007199254740993.10',
            'cash',
          ],
        ],
      }
    if (sql.includes('from "shops"'))
      return {
        rows: [
          ['Main shop', '6'],
          ['Empty shop', '0'],
        ],
      }
    if (sql.includes('from "stores"')) return { rows: [['Warehouse', '15']] }
    if (sql.includes('from "store_transfers"')) return { rows: [['2']] }
    if (sql.includes('from "low_stock_alerts"')) {
      return sql.includes('left join "stores"')
        ? { rows: [['store-id', 'Central warehouse', '4']] }
        : {
            rows: [
              ['shop-id', 'Main shop', '3'],
              ['orphan-shop-id', 'Shop', '2'],
            ],
          }
    }
    if (sql.includes('from "supply_routes"')) return { rows: [['1']] }
    if (sql.includes('from "items"')) return { rows: [['3']] }
    throw new Error(`Unexpected query: ${sql}`)
  })
})

describe('dashboard overview', () => {
  it('protects the endpoint before accessing any database data', async () => {
    mocks.role = 'sales'
    await expect(call()).rejects.toThrow('Forbidden')
    expect(mocks.requireSessionAndRole).toHaveBeenCalledWith([
      'admin',
      'supervisor',
    ])
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('returns aggregates, exact sale amounts and at most six recent sales', async () => {
    const result = await call()
    expect(result.summary).toEqual({
      warehouseUnits: 15,
      shopUnits: 6,
      catalogItems: 3,
      pendingTransfers: 2,
    })
    expect(result.locations).toContainEqual({
      name: 'Empty shop',
      kind: 'shop',
      quantity: 0,
    })
    expect(result.openSupplyRoutes).toBe(1)
    expect(result.lowStockCount).toBe(9)
    expect(result.lowStockLocations).toEqual([
      {
        scope: 'store',
        locationId: 'store-id',
        name: 'Central warehouse',
        count: 4,
      },
      { scope: 'shop', locationId: 'shop-id', name: 'Main shop', count: 3 },
      { scope: 'shop', locationId: 'orphan-shop-id', name: 'Shop', count: 2 },
    ])
    expect(result.salesSeries).toHaveLength(90)
    expect(result.recentSales[0]).toEqual({
      id: 'sale-id',
      reference: 'sale-id',
      shopName: 'Main shop',
      soldAt: '2026-10-12T21:30:00.000Z',
      totalAmountUgx: '9007199254740993.10',
      paymentMethod: 'cash',
    })
    const queries = mocks.query.mock.calls.map(
      ([query]) => query.text as string,
    )
    const salesSql = queries.find((sql) => sql.includes('to_char'))
    expect(salesSql).toContain('Africa/Kampala')
    expect(salesSql).toContain('group by')
    expect(salesSql).not.toContain('shop_sale_lines')
    const recent = mocks.query.mock.calls.find(([query]) =>
      query.text.includes('order by "shop_sales"."sale_date" desc'),
    )
    expect(recent?.[1]).toContain(6)
  })

  it('does not query or return warehouse/procurement data for supervisors', async () => {
    mocks.role = 'supervisor'
    const result = await call()
    expect(result.summary.warehouseUnits).toBeNull()
    expect(result.openSupplyRoutes).toBeNull()
    expect(result.locations.every((location) => location.kind === 'shop')).toBe(
      true,
    )
    expect(result.lowStockCount).toBe(5)
    expect(result.lowStockLocations).toEqual([
      { scope: 'shop', locationId: 'shop-id', name: 'Main shop', count: 3 },
      { scope: 'shop', locationId: 'orphan-shop-id', name: 'Shop', count: 2 },
    ])
    const queries = mocks.query.mock.calls.map(
      ([query]) => query.text as string,
    )
    expect(
      queries.some(
        (sql) =>
          sql.includes('"store_stock"') ||
          sql.includes('"stores"') ||
          sql.includes('"supply_routes"'),
      ),
    ).toBe(false)
    const alertQuery = mocks.query.mock.calls.find(([query]) =>
      query.text.includes('from "low_stock_alerts"'),
    )
    expect(alertQuery?.[1]).toEqual(['open', 'shop'])
    expect(alertQuery?.[0].text).toContain('coalesce("shops"."name", \'Shop\')')
    expect(alertQuery?.[0].text).toContain(
      'group by "low_stock_alerts"."location_id"',
    )
  })

  it('returns zero-filled sales and zero summaries for an empty database', async () => {
    mocks.query.mockResolvedValue({ rows: [] })
    const result = await call()
    expect(result.summary).toEqual({
      warehouseUnits: 0,
      shopUnits: 0,
      catalogItems: 0,
      pendingTransfers: 0,
    })
    expect(result.locations).toEqual([])
    expect(result.recentSales).toEqual([])
    expect(result.lowStockCount).toBe(0)
    expect(result.lowStockLocations).toEqual([])
    expect(result.openSupplyRoutes).toBe(0)
    expect(result.salesSeries).toHaveLength(90)
    expect(
      result.salesSeries.every(
        (day) => day.revenueUgx === '0.00' && day.sales === 0,
      ),
    ).toBe(true)
  })
})
