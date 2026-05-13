import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import { requireUiPermission } from "#/lib/permissions"
import { listShopsForReports } from "#/server/functions/shop/list-shops"
import { getXReport } from "#/server/functions/accounting/shift-reports"
import { ShopPicker } from "#/components/reports/shop-picker"
import { XReportView } from "#/components/reports/x-report-view"
import { Button } from "#/components/ui/button"
import { ZCloseDialog } from "#/components/reports/z-close-dialog"

export const Route = createFileRoute("/reports/x")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "shift.reports.view"),
  loader: async () => {
    const shops = await listShopsForReports()
    if (shops.length === 0) {
      return { shops, report: null, shopId: null as string | null }
    }
    const shopId = shops[0].id
    const report = await getXReport({ data: { shopId } })
    return { shops, report, shopId }
  },
  component: XReportPage,
})

function XReportPage() {
  const initial = Route.useLoaderData()
  const [shopId, setShopId] = React.useState(initial.shopId)
  const [report, setReport] = React.useState(initial.report)
  const [closeOpen, setCloseOpen] = React.useState(false)

  async function pickShop(id: string) {
    setShopId(id)
    const r = await getXReport({ data: { shopId: id } })
    setReport(r)
  }

  if (!shopId || !report) {
    return (
      <div className="text-muted-foreground">
        No shop available — ask an admin to create one.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">X Report</h1>
          <ShopPicker
            shops={initial.shops}
            value={shopId}
            onChange={(id) => void pickShop(id)}
          />
        </div>
        <Button onClick={() => setCloseOpen(true)}>Close shift (Z)</Button>
      </div>
      <XReportView
        gross={report.grossSalesUgx}
        cash={report.cashSalesUgx}
        bank={report.bankSalesUgx}
        credit={report.creditSalesUgx}
        salesCount={report.salesCount}
        byClerk={report.byClerk}
        asOf={new Date(report.asOf)}
        periodStart={new Date(report.periodStart)}
        previousClosureNumber={report.previousClosureNumber}
      />
      <ZCloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        shopId={shopId}
        expectedCashUgx={report.cashSalesUgx}
      />
    </div>
  )
}
