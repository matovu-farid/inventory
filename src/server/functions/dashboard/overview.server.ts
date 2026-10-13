import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from 'drizzle-orm'
import { db } from '#/db'
import {
  items,
  lowStockAlerts,
  shopSales,
  shops,
  shopStock,
  stores,
  storeStock,
  storeTransfers,
  supplyRoutes,
} from '#/db/schema'
import { fillDashboardSalesSeries, getDashboardDate } from '#/lib/dashboard'
import type { DashboardOverview } from '#/lib/dashboard'

/** Read-only aggregate queries. Admin-only tables are never queried for supervisors. */
export async function getDashboardOverviewQuery(
  includeWarehouse: boolean,
): Promise<DashboardOverview> {
  const asOfDate = getDashboardDate(new Date())
  const emptySeries = fillDashboardSalesSeries(asOfDate, [])
  const periodStart = new Date(`${emptySeries[0].date}T00:00:00+03:00`)
  const periodEnd = new Date(`${asOfDate}T00:00:00+03:00`)
  periodEnd.setUTCDate(periodEnd.getUTCDate() + 1)
  const saleDay = sql<string>`to_char(${shopSales.saleDate} AT TIME ZONE 'Africa/Kampala', 'YYYY-MM-DD')`

  const [
    dailySales,
    shopLocations,
    catalogCount,
    transferCount,
    shopAlertLocations,
    recentSales,
    warehouseLocations,
    supplyCount,
    warehouseAlertLocations,
  ] = await Promise.all([
    db
      .select({
        date: saleDay,
        revenueUgx: sql<string>`coalesce(sum(${shopSales.totalAmount}), 0)::text`,
        sales: count(),
      })
      .from(shopSales)
      .where(
        and(
          gte(shopSales.saleDate, periodStart),
          lt(shopSales.saleDate, periodEnd),
        ),
      )
      .groupBy(saleDay)
      .orderBy(saleDay),
    db
      .select({
        name: shops.name,
        quantity:
          sql<number>`coalesce(sum(${shopStock.quantityOnHand}), 0)`.mapWith(
            Number,
          ),
      })
      .from(shops)
      .leftJoin(shopStock, eq(shopStock.shopId, shops.id))
      .groupBy(shops.id, shops.name)
      .orderBy(shops.name),
    db.select({ count: count() }).from(items).where(isNull(items.deletedAt)),
    db
      .select({ count: count() })
      .from(storeTransfers)
      .where(inArray(storeTransfers.status, ['pending', 'dispatched'])),
    db
      .select({
        locationId: lowStockAlerts.locationId,
        name: sql<string>`coalesce(${shops.name}, 'Shop')`,
        count: count(lowStockAlerts.id),
      })
      .from(lowStockAlerts)
      .leftJoin(shops, eq(shops.id, lowStockAlerts.locationId))
      .where(
        and(
          eq(lowStockAlerts.status, 'open'),
          eq(lowStockAlerts.scope, 'shop'),
        ),
      )
      .groupBy(lowStockAlerts.locationId, shops.name)
      .orderBy(shops.name, lowStockAlerts.locationId),
    db
      .select({
        id: shopSales.id,
        reference: shopSales.documentNumber,
        shopName: shops.name,
        soldAt: shopSales.saleDate,
        totalAmountUgx: shopSales.totalAmount,
        paymentMethod: shopSales.paymentMethod,
      })
      .from(shopSales)
      .innerJoin(shops, eq(shopSales.shopId, shops.id))
      .orderBy(desc(shopSales.saleDate), desc(shopSales.id))
      .limit(6),
    includeWarehouse
      ? db
          .select({
            name: stores.name,
            quantity:
              sql<number>`coalesce(sum(${storeStock.quantityOnHand}), 0)`.mapWith(
                Number,
              ),
          })
          .from(stores)
          .leftJoin(storeStock, eq(storeStock.storeId, stores.id))
          .groupBy(stores.id, stores.name)
          .orderBy(stores.name)
      : Promise.resolve([]),
    includeWarehouse
      ? db
          .select({ count: count() })
          .from(supplyRoutes)
          .where(eq(supplyRoutes.status, 'open'))
      : Promise.resolve([]),
    includeWarehouse
      ? db
          .select({
            locationId: lowStockAlerts.locationId,
            name: sql<string>`coalesce(${stores.name}, 'Warehouse')`,
            count: count(lowStockAlerts.id),
          })
          .from(lowStockAlerts)
          .leftJoin(stores, eq(stores.id, lowStockAlerts.locationId))
          .where(
            and(
              eq(lowStockAlerts.status, 'open'),
              eq(lowStockAlerts.scope, 'store'),
            ),
          )
          .groupBy(lowStockAlerts.locationId, stores.name)
          .orderBy(stores.name, lowStockAlerts.locationId)
      : Promise.resolve([]),
  ])

  const lowStockLocations: DashboardOverview['lowStockLocations'] = [
    ...warehouseAlertLocations.map((location) => ({
      ...location,
      scope: 'store' as const,
    })),
    ...shopAlertLocations.map((location) => ({
      ...location,
      scope: 'shop' as const,
    })),
  ]

  return {
    asOfDate,
    salesSeries: fillDashboardSalesSeries(asOfDate, dailySales),
    summary: {
      warehouseUnits: includeWarehouse
        ? warehouseLocations.reduce(
            (sum, location) => sum + location.quantity,
            0,
          )
        : null,
      shopUnits: shopLocations.reduce(
        (sum, location) => sum + location.quantity,
        0,
      ),
      catalogItems: catalogCount[0]?.count ?? 0,
      pendingTransfers: transferCount[0]?.count ?? 0,
    },
    locations: [
      ...warehouseLocations.map((location) => ({
        ...location,
        kind: 'warehouse' as const,
      })),
      ...shopLocations.map((location) => ({
        ...location,
        kind: 'shop' as const,
      })),
    ],
    recentSales: recentSales.map((sale) => ({
      ...sale,
      reference: sale.reference ?? sale.id,
      soldAt: sale.soldAt.toISOString(),
    })),
    lowStockCount: lowStockLocations.reduce(
      (sum, location) => sum + location.count,
      0,
    ),
    lowStockLocations,
    openSupplyRoutes: includeWarehouse ? (supplyCount[0]?.count ?? 0) : null,
  }
}
