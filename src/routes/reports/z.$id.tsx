import { createFileRoute, useSearch } from "@tanstack/react-router"
import * as React from "react"
import { z } from "zod"
import { requireUiPermission } from "#/lib/permissions"
import { getZReportById } from "#/server/functions/accounting/shift-reports"
import { renderShiftClosure } from "#/lib/pdf/shift-closure-html"
import { openShiftClosurePrintWindow } from "#/lib/pos/print-shift-closure"
import { XReportView } from "#/components/reports/x-report-view"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/reports/z/$id")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "shift.reports.view"),
  validateSearch: z.object({ print: z.string().optional() }),
  loader: async ({ params }) => getZReportById({ data: { id: params.id } }),
  component: ZDetailPage,
})

function ZDetailPage() {
  const closure = Route.useLoaderData()
  const search = useSearch({ from: "/reports/z/$id" })

  const openPrint = React.useCallback(() => {
    const html = renderShiftClosure({
      closureNumber: closure.closureNumber,
      shopName: closure.shop.name,
      closedByName: closure.closedByUser?.name ?? null,
      periodStart: new Date(closure.periodStart),
      closedAt: new Date(closure.closedAt),
      grossSalesUgx: closure.grossSalesUgx,
      cashSalesUgx: closure.cashSalesUgx,
      bankSalesUgx: closure.bankSalesUgx,
      creditSalesUgx: closure.creditSalesUgx,
      declaredCashUgx: closure.declaredCashUgx,
      expectedCashUgx: closure.expectedCashUgx,
      varianceUgx: closure.varianceUgx,
      salesCount: closure.salesCount,
      byClerk: closure.byClerk,
    })
    openShiftClosurePrintWindow(html)
  }, [closure])

  React.useEffect(() => {
    if (search.print === "1") openPrint()
  }, [search.print, openPrint])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          Z #{closure.closureNumber} — {closure.shop.name}
        </h1>
        <Button onClick={openPrint}>Print</Button>
      </div>
      <XReportView
        gross={closure.grossSalesUgx}
        cash={closure.cashSalesUgx}
        bank={closure.bankSalesUgx}
        credit={closure.creditSalesUgx}
        salesCount={closure.salesCount}
        byClerk={closure.byClerk}
        asOf={new Date(closure.closedAt)}
        periodStart={new Date(closure.periodStart)}
        previousClosureNumber={closure.closureNumber - 1}
      />
    </div>
  )
}
