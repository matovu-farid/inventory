import { Link } from '@tanstack/react-router'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { formatDateTime, formatUgxTotal } from '#/lib/format'

interface Row {
  id: string
  closureNumber: number
  closedAt: Date | string
  grossSalesUgx: string
  varianceUgx: string
}

export function ZHistoryTable({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-md border">
      <ResponsiveTable
        data={rows}
        getRowKey={(r) => r.id}
        columns={[
          {
            header: '#',
            cell: (r) => (
              <Link
                className="underline"
                to="/reports/z/$id"
                params={{ id: r.id }}
              >
                Z #{r.closureNumber}
              </Link>
            ),
          },
          {
            header: 'Closed',
            cell: (r) => formatDateTime(r.closedAt),
          },
          {
            header: 'Gross',
            align: 'right',
            cell: (r) => (
              <span className="font-mono">
                {formatUgxTotal(r.grossSalesUgx)}
              </span>
            ),
          },
          {
            header: 'Variance',
            align: 'right',
            cell: (r) => (
              <span className="font-mono">{formatUgxTotal(r.varianceUgx)}</span>
            ),
          },
        ]}
        emptyMessage="No closures yet."
      />
    </div>
  )
}
