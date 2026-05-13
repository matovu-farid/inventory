import { createFileRoute, Link } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import { listShopsForReports } from "#/server/functions/shop/list-shops"
import { getZReportHistory } from "#/server/functions/accounting/shift-reports"
import { ZHistoryTable } from "#/components/reports/z-history-table"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/reports/z")({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, "shift.reports.view"),
  loader: async () => {
    const shops = await listShopsForReports()
    if (shops.length === 0) {
      return {
        shops,
        history: [] as Awaited<ReturnType<typeof getZReportHistory>>,
      }
    }
    const history = await getZReportHistory({
      data: { shopId: shops[0].id, limit: 10 },
    })
    return { shops, history }
  },
  component: ZIndexPage,
})

function ZIndexPage() {
  const { history } = Route.useLoaderData()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Z Reports</h1>
        <Button asChild>
          <Link to="/reports/x">Open current shift (X)</Link>
        </Button>
      </div>
      <ZHistoryTable
        rows={history.map((h) => ({
          id: h.id,
          closureNumber: h.closureNumber,
          closedAt: new Date(h.closedAt),
          grossSalesUgx: h.grossSalesUgx,
          varianceUgx: h.varianceUgx,
        }))}
      />
    </div>
  )
}
