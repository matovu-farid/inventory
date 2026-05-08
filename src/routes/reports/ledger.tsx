import { createFileRoute } from "@tanstack/react-router"
import { roundUgxFloor50 } from "#/lib/format"
import { Badge } from "#/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { getLedgerEntries } from "#/server/functions/accounting/reports"

export const Route = createFileRoute("/reports/ledger")({
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

      {entries.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">
          No ledger entries yet.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>DR/CR</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">
                    {new Date(e.transactionDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {e.categoryName}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {e.categoryType}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={e.type === "debit" ? "default" : "secondary"}
                    >
                      {e.type === "debit" ? "DR" : "CR"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {roundUgxFloor50(e.amount).toFormat(0)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                    {e.description ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.referenceType}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {e.locationType}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
