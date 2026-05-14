import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { desc, eq } from "drizzle-orm"
import { db } from "#/db"
import { shiftClosures } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { makeDbIdempotencyStore } from "#/server/middleware/idempotency-store"
import { withIdempotency } from "#/server/middleware/idempotency"
import {
  computeShiftAggregates,
  findPeriodStart,
} from "./shift-reports-internals"

export const getXReport = createServerFn()
  .inputValidator(z.object({ shopId: z.uuid() }))
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
      shopId: z.uuid(),
      declaredCashUgx: z.string(),
      notes: z.string().optional(),
      idempotencyKey: z.uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id
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
      shopId: z.uuid(),
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
  .inputValidator(z.object({ id: z.uuid() }))
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
