import BigNumber from 'bignumber.js'
import { and, desc, eq, gt, lte } from 'drizzle-orm'
import { db } from '#/db'
import { shopSales, shiftClosures, user as userTable } from '#/db/schema'

export interface ShiftAggregates {
  grossSalesUgx: string
  cashSalesUgx: string
  bankSalesUgx: string
  creditSalesUgx: string
  salesCount: number
  byClerk: Array<{
    userId: string
    userName: string | null
    totalUgx: string
    count: number
  }>
}

export async function computeShiftAggregates(
  shopId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ShiftAggregates> {
  const rows = await db
    .select({
      paymentMethod: shopSales.paymentMethod,
      totalAmount: shopSales.totalAmount,
      soldBy: shopSales.soldBy,
      userName: userTable.name,
    })
    .from(shopSales)
    .leftJoin(userTable, eq(shopSales.soldBy, userTable.id))
    .where(
      and(
        eq(shopSales.shopId, shopId),
        gt(shopSales.saleDate, periodStart),
        lte(shopSales.saleDate, periodEnd),
      ),
    )

  let cash = new BigNumber(0)
  let bank = new BigNumber(0)
  let credit = new BigNumber(0)
  const byClerkMap = new Map<
    string,
    { userId: string; userName: string | null; total: BigNumber; count: number }
  >()

  for (const r of rows) {
    const amt = new BigNumber(r.totalAmount)
    if (r.paymentMethod === 'cash') cash = cash.plus(amt)
    else if (r.paymentMethod === 'bank') bank = bank.plus(amt)
    else credit = credit.plus(amt)

    const existing = byClerkMap.get(r.soldBy) ?? {
      userId: r.soldBy,
      userName: r.userName,
      total: new BigNumber(0),
      count: 0,
    }
    existing.total = existing.total.plus(amt)
    existing.count += 1
    byClerkMap.set(r.soldBy, existing)
  }

  const gross = cash.plus(bank).plus(credit)
  return {
    grossSalesUgx: gross.toFixed(2),
    cashSalesUgx: cash.toFixed(2),
    bankSalesUgx: bank.toFixed(2),
    creditSalesUgx: credit.toFixed(2),
    salesCount: rows.length,
    byClerk: Array.from(byClerkMap.values()).map((c) => ({
      userId: c.userId,
      userName: c.userName,
      totalUgx: c.total.toFixed(2),
      count: c.count,
    })),
  }
}

export async function findPeriodStart(
  shopId: string,
): Promise<{ periodStart: Date; previousClosureNumber: number }> {
  const rows = await db
    .select({
      closedAt: shiftClosures.closedAt,
      closureNumber: shiftClosures.closureNumber,
    })
    .from(shiftClosures)
    .where(eq(shiftClosures.shopId, shopId))
    .orderBy(desc(shiftClosures.closureNumber))
    .limit(1)
  if (rows.length === 0) {
    return { periodStart: new Date(0), previousClosureNumber: 0 }
  }
  return {
    periodStart: rows[0].closedAt,
    previousClosureNumber: rows[0].closureNumber,
  }
}
