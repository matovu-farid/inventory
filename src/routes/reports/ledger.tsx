import { createFileRoute } from "@tanstack/react-router"
import { formatUgx, formatDate } from "#/lib/format"
import { requireUiPermission } from "#/lib/permissions"
import { Badge } from "#/components/ui/badge"
import { ResponsiveTable } from "#/components/ui/responsive-table"
import { getLedgerEntries } from "#/server/functions/accounting/reports"

export const Route = createFileRoute("/reports/ledger")({
  beforeLoad: ({ context }) => requireUiPermission(context, "reports.view"),
  loader: () => getLedgerEntries({ data: { limit: 100, offset: 0 } }),
  component: LedgerPage,
})

function LedgerPage() {
  const entries = Route.useLoaderData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">General Ledger</h1>
        <p className="text-muted-foreground">
          Complete journal entry history.
        </p>
      </div>

      <div className="rounded-md border">
        <ResponsiveTable
          data={entries}
          getRowKey={(e) => e.id}
          emptyMessage="No ledger entries yet."
          columns={[
            {
              header: "Date",
              cell: (e) => (
                <span className="text-xs">
                  {formatDate(e.transactionDate)}
                </span>
              ),
            },
            {
              header: "Account",
              cell: (e) => (
                <span className="font-medium text-sm">{e.categoryName}</span>
              ),
            },
            {
              header: "DR/CR",
              cell: (e) => (
                <Badge variant={e.type === "debit" ? "default" : "secondary"}>
                  {e.type === "debit" ? "DR" : "CR"}
                </Badge>
              ),
            },
            {
              header: "Amount",
              align: "right",
              cell: (e) => (
                <span className="font-mono">
                  {formatUgx(e.amount)}
                </span>
              ),
            },
            {
              header: "Type",
              hideOnMobile: true,
              cell: (e) => (
                <Badge variant="outline" className="text-xs">
                  {e.categoryType}
                </Badge>
              ),
            },
            {
              header: "Description",
              hideOnMobile: true,
              cell: (e) => (
                <span className="text-sm text-muted-foreground max-w-48 truncate block">
                  {e.description ?? "-"}
                </span>
              ),
            },
            {
              header: "Ref",
              hideOnMobile: true,
              cell: (e) => (
                <span className="text-xs text-muted-foreground">
                  {e.referenceType}
                </span>
              ),
            },
            {
              header: "Location",
              hideOnMobile: true,
              cell: (e) => (
                <Badge variant="outline" className="text-xs">
                  {e.locationType}
                </Badge>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
