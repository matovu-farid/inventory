import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { and, desc, eq, gt, lte } from "drizzle-orm"
import { db } from "#/db"
import { shopSales, shiftClosures, user as userTable } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { makeDbIdempotencyStore } from "#/server/middleware/idempotency-store"
import { withIdempotency } from "#/server/middleware/idempotency"

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
    if (r.paymentMethod === "cash") cash = cash.plus(amt)
    else if (r.paymentMethod === "bank") bank = bank.plus(amt)
    else credit = credit.plus(amt)

    const existing =
      byClerkMap.get(r.soldBy) ?? {
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

export const getXReport = createServerFn()
  .inputValidator(z.object({ shopId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const { periodStart, previousClosureNumber } = await findPeriodStart(
      data.shopId,
    )
    const asOf = new Date()
    const aggregates = await computeShiftAggregates(
      data.shopId,
      periodStart,
      asOf,
    )
    return {
      shopId: data.shopId,
      periodStart,
      asOf,
      previousClosureNumber,
      ...aggregates,
    }
  })

export const closeZReport = createServerFn()
  .inputValidator(
    z.object({
      shopId: z.string().uuid(),
      declaredCashUgx: z.string(),
      notes: z.string().optional(),
      idempotencyKey: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id
    const store = makeDbIdempotencyStore(db)

    return withIdempotency(store, data.idempotencyKey, async () => {
      const closedAt = new Date()
      const { periodStart, previousClosureNumber } = await findPeriodStart(
        data.shopId,
      )
      const agg = await computeShiftAggregates(
        data.shopId,
        periodStart,
        closedAt,
      )
      const expectedCash = new BigNumber(agg.cashSalesUgx)
      const variance = new BigNumber(data.declaredCashUgx).minus(expectedCash)
      const [row] = await db
        .insert(shiftClosures)
        .values({
          shopId: data.shopId,
          closureNumber: previousClosureNumber + 1,
          periodStart,
          closedAt,
          closedBy: userId,
          openingCashUgx: "0",
          declaredCashUgx: data.declaredCashUgx,
          expectedCashUgx: expectedCash.toFixed(2),
          varianceUgx: variance.toFixed(2),
          grossSalesUgx: agg.grossSalesUgx,
          cashSalesUgx: agg.cashSalesUgx,
          bankSalesUgx: agg.bankSalesUgx,
          creditSalesUgx: agg.creditSalesUgx,
          salesCount: agg.salesCount,
          notes: data.notes ?? null,
        })
        .returning()
      return row
    })
  })

export const getZReportHistory = createServerFn()
  .inputValidator(
    z.object({
      shopId: z.string().uuid(),
      limit: z.number().int().positive().max(50).default(10),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    return db
      .select()
      .from(shiftClosures)
      .where(eq(shiftClosures.shopId, data.shopId))
      .orderBy(desc(shiftClosures.closureNumber))
      .limit(data.limit)
  })

export const getZReportById = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const closure = await db.query.shiftClosures.findFirst({
      where: eq(shiftClosures.id, data.id),
      with: {
        shop: true,
        closedByUser: { columns: { id: true, name: true } },
      },
    })
    if (!closure) throw new Error(`Shift closure not found: ${data.id}`)
    const byClerk = (
      await computeShiftAggregates(
        closure.shopId,
        closure.periodStart,
        closure.closedAt,
      )
    ).byClerk
    return { ...closure, byClerk }
  })
