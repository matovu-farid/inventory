import { createFileRoute, useRouter } from '@tanstack/react-router'
import { formatUgx, formatUgxTotal, formatDate } from '#/lib/format'
import {
  formatReportPeriod,
  reportDateRangeSchema,
} from '#/lib/report-date-range'
import { buildCsv, downloadCsv } from '#/lib/report-export'
import { requireUiPermission } from '#/lib/permissions'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { ReportToolbar } from '#/components/reports/report-toolbar'
import {
  getLedgerEntries,
  getLedgerTotals,
} from '#/server/functions/accounting/reports'

export const Route = createFileRoute('/reports/ledger')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'reports.view'),
  validateSearch: reportDateRangeSchema,
  loaderDeps: ({ search }) => ({ from: search.from, to: search.to }),
  loader: async ({ deps }) => {
    const [entries, totals] = await Promise.all([
      getLedgerEntries({
        data: { from: deps.from, to: deps.to, limit: 100, offset: 0 },
      }),
      getLedgerTotals({ data: { from: deps.from, to: deps.to } }),
    ])
    return { entries, totals }
  },
  component: LedgerPage,
})

function LedgerPage() {
  const { entries, totals } = Route.useLoaderData()
  const { from = '', to = '' } = Route.useSearch()
  const router = useRouter()
  const periodLabel = formatReportPeriod(from, to)

  function applyRange(nextFrom: string, nextTo: string) {
    void router.navigate({
      to: '/reports/ledger',
      search: { from: nextFrom || undefined, to: nextTo || undefined },
    })
  }

  function clearRange() {
    void router.navigate({ to: '/reports/ledger', search: {} })
  }

  function exportCsv() {
    const rows = [
      ['Scope: latest 100 entries', '', '', '', '', '', '', ''],
      ...entries.map((entry) => [
        formatDate(entry.transactionDate),
        entry.categoryName,
        entry.type === 'debit' ? 'DR' : 'CR',
        entry.amount,
        entry.categoryType,
        entry.description ?? '',
        entry.referenceType ?? '',
        entry.locationType,
      ]),
    ]
    downloadCsv(
      'general-ledger.csv',
      buildCsv(
        [
          'Date',
          'Account',
          'DR/CR',
          'Amount (UGX)',
          'Type',
          'Description',
          'Reference',
          'Location',
        ],
        rows,
      ),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">General Ledger</h1>
          <p className="mt-1 text-muted-foreground">
            Latest 100 journal entries · {periodLabel}
          </p>
        </div>
      </div>

      <ReportToolbar
        from={from}
        to={to}
        onApply={applyRange}
        onClear={clearRange}
        onPrint={() => window.print()}
        onExportCsv={exportCsv}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:hidden">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Visible entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{entries.length}</p>
            <p className="text-xs text-muted-foreground">
              Showing {entries.length} of up to 100 entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total debits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-bold tabular-nums">
              {formatUgxTotal(totals.debits)}
            </p>
            <p className="text-xs text-muted-foreground">
              All filtered journal entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total credits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xl font-bold tabular-nums">
              {formatUgxTotal(totals.credits)}
            </p>
            <p className="text-xs text-muted-foreground">
              All filtered journal entries
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border print:border-0">
        <ResponsiveTable
          data={entries}
          getRowKey={(entry) => entry.id}
          emptyMessage={`No journal entries for ${periodLabel.toLowerCase()}.`}
          columns={[
            {
              header: 'Date',
              cell: (entry) => (
                <span className="text-xs">
                  {formatDate(entry.transactionDate)}
                </span>
              ),
            },
            {
              header: 'Account',
              cell: (entry) => (
                <span className="text-sm font-medium">
                  {entry.categoryName}
                </span>
              ),
            },
            {
              header: 'DR/CR',
              cell: (entry) => (
                <Badge
                  variant={entry.type === 'debit' ? 'default' : 'secondary'}
                >
                  {entry.type === 'debit' ? 'DR' : 'CR'}
                </Badge>
              ),
            },
            {
              header: 'Amount',
              align: 'right',
              cell: (entry) => (
                <span className="font-mono">{formatUgx(entry.amount)}</span>
              ),
            },
            {
              header: 'Type',
              hideOnMobile: true,
              cell: (entry) => (
                <Badge variant="outline" className="text-xs">
                  {entry.categoryType}
                </Badge>
              ),
            },
            {
              header: 'Description',
              hideOnMobile: true,
              cell: (entry) => (
                <span className="block max-w-48 truncate text-sm text-muted-foreground">
                  {entry.description ?? '-'}
                </span>
              ),
            },
            {
              header: 'Ref',
              hideOnMobile: true,
              cell: (entry) => (
                <span className="text-xs text-muted-foreground">
                  {entry.referenceType ?? '-'}
                </span>
              ),
            },
            {
              header: 'Location',
              hideOnMobile: true,
              cell: (entry) => (
                <Badge variant="outline" className="text-xs">
                  {entry.locationType}
                </Badge>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
