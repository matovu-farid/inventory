import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { formatDateTime, formatUgxTotal } from '#/lib/format'

interface Row {
  userId: string
  userName: string | null
  totalUgx: string
  count: number
}

interface Props {
  gross: string
  cash: string
  bank: string
  credit: string
  salesCount: number
  byClerk: Row[]
  asOf: Date
  periodStart: Date
  previousClosureNumber: number
}

export function XReportView(p: Props) {
  const kpis: Array<[string, string]> = [
    ['Gross', formatUgxTotal(p.gross)],
    ['Cash', formatUgxTotal(p.cash)],
    ['Bank', formatUgxTotal(p.bank)],
    ['Credit', formatUgxTotal(p.credit)],
  ]
  const sinceLabel =
    p.periodStart.getTime() === 0
      ? 'the beginning'
      : `Z #${p.previousClosureNumber} (${formatDateTime(p.periodStart)})`

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Since {sinceLabel} · {p.salesCount} sale(s)
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold font-mono">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          By clerk
        </h3>
        <div className="rounded-md border">
          <ResponsiveTable
            data={p.byClerk}
            getRowKey={(r) => r.userId}
            columns={[
              { header: 'Clerk', cell: (r) => r.userName ?? r.userId },
              { header: 'Sales', align: 'right', cell: (r) => r.count },
              {
                header: 'Total',
                align: 'right',
                cell: (r) => (
                  <span className="font-mono">
                    {formatUgxTotal(r.totalUgx)}
                  </span>
                ),
              },
            ]}
            emptyMessage="No sales yet."
          />
        </div>
      </div>
    </div>
  )
}
