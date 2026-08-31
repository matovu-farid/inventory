import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { BarChart3, BookOpen, ClipboardList, Receipt } from 'lucide-react'
import BigNumber from 'bignumber.js'
import { requireUiPermission, useCan } from '#/lib/permissions'
import {
  formatReportPeriod,
  reportDateRangeSchema,
} from '#/lib/report-date-range'
import { buildCsv, downloadCsv } from '#/lib/report-export'
import { formatUgx, formatUgxTotal } from '#/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { InfoPopover } from '#/components/ui/info-popover'
import { Button } from '#/components/ui/button'
import { ReportToolbar } from '#/components/reports/report-toolbar'
import {
  getBalanceSheet,
  getCashPosition,
  getProfitAndLoss,
} from '#/server/functions/accounting/reports'

export const Route = createFileRoute('/reports/')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'reports.view'),
  validateSearch: reportDateRangeSchema,
  loaderDeps: ({ search }) => ({ from: search.from, to: search.to }),
  loader: async ({ deps }) => {
    const [pnl, bs, cash] = await Promise.all([
      getProfitAndLoss({ data: { from: deps.from, to: deps.to } }),
      getBalanceSheet({ data: { asOf: deps.to } }),
      getCashPosition({ data: { from: deps.from, to: deps.to } }),
    ])
    return { pnl, bs, cash }
  },
  component: ReportsDashboard,
})

type StatementRow = { name: string; amount: string }

const reportCards = [
  {
    icon: BarChart3,
    title: 'Financial Summary',
    description: 'Revenue, expenses, cash, assets, liabilities, and equity.',
    to: '/reports',
    permission: undefined,
  },
  {
    icon: BookOpen,
    title: 'General Ledger',
    description: 'The latest journal entries with debit and credit totals.',
    to: '/reports/ledger',
    permission: undefined,
  },
  {
    icon: ClipboardList,
    title: 'X Report',
    description: 'A live view of the current shop shift before closing.',
    to: '/reports/x',
    permission: 'shift.reports.view' as const,
  },
  {
    icon: Receipt,
    title: 'Z Reports',
    description: 'Review immutable closed-shift reports and cash variances.',
    to: '/reports/z',
    permission: 'shift.reports.view' as const,
  },
] as const

function Definition({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <InfoPopover ariaLabel={`Explain ${label}`}>{children}</InfoPopover>
    </span>
  )
}

function ReportStatementHeader({
  title,
  period,
}: {
  title: string
  period: string
}) {
  return (
    <div className="mb-6 text-center">
      <p className="text-base font-semibold">Inventory Management</p>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{period}</p>
    </div>
  )
}

function StatementTable({
  rows,
  totalLabel,
  total,
  emptyMessage,
}: {
  rows: StatementRow[]
  totalLabel: string
  total: string
  emptyMessage: string
}) {
  return (
    <div className="overflow-x-auto">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="py-1.5 pl-6">{row.name}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">
                  {formatUgx(row.amount)}
                </td>
              </tr>
            ))}
            <tr className="border-t">
              <td className="py-2 pl-2 font-semibold">{totalLabel}</td>
              <td className="py-2 text-right font-mono font-semibold tabular-nums">
                {formatUgxTotal(total)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

function ReportsDashboard() {
  const { pnl, bs, cash } = Route.useLoaderData()
  const { from = '', to = '' } = Route.useSearch()
  const router = useRouter()
  const canViewShiftReports = useCan('shift.reports.view')
  const periodLabel = formatReportPeriod(from, to)

  function applyRange(nextFrom: string, nextTo: string) {
    void router.navigate({
      to: '/reports',
      search: { from: nextFrom || undefined, to: nextTo || undefined },
    })
  }

  function clearRange() {
    void router.navigate({ to: '/reports', search: {} })
  }

  function exportCsv() {
    const rows: Array<Array<string | number>> = [
      ['Period', periodLabel, ''],
      ['Cash Position', 'Cash on Hand', cash.cashBalance],
      ['Cash Position', 'Bank Balance', cash.bankBalance],
      ['Cash Position', 'Total Liquidity', cash.totalBalance],
      ['Profit & Loss', 'Revenue', ''],
      ...pnl.revenueItems.map((row) => ['Revenue', row.name, row.amount]),
      ['Profit & Loss', 'Total Revenue', pnl.totalRevenue],
      ['Profit & Loss', 'Expenses', ''],
      ...pnl.expenseItems.map((row) => ['Expense', row.name, row.amount]),
      ['Profit & Loss', 'Total Expenses', pnl.totalExpenses],
      ['Profit & Loss', 'Net Income', pnl.netIncome],
      ['Balance Sheet', 'Assets', ''],
      ...bs.assets.map((row) => ['Asset', row.name, row.balance]),
      ['Balance Sheet', 'Total Assets', bs.totalAssets],
      ['Balance Sheet', 'Liabilities', ''],
      ...bs.liabilities.map((row) => ['Liability', row.name, row.balance]),
      ['Balance Sheet', 'Total Liabilities', bs.totalLiabilities],
      ['Balance Sheet', 'Equity', ''],
      ...bs.equity.map((row) => ['Equity', row.name, row.balance]),
      ['Balance Sheet', 'Total Equity', bs.totalEquity],
    ]
    downloadCsv(
      'financial-report.csv',
      buildCsv(['Section', 'Line item', 'Amount (UGX)'], rows),
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Financial Reports</h1>
          <p className="mt-1 text-muted-foreground">
            A clear view of performance and financial position.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{periodLabel}</p>
      </div>

      <ReportToolbar
        from={from}
        to={to}
        onApply={applyRange}
        onClear={clearRange}
        onPrint={() => window.print()}
        onExportCsv={exportCsv}
      />

      <section aria-labelledby="cash-position-heading" className="space-y-4">
        <div>
          <h2 id="cash-position-heading" className="text-lg font-semibold">
            Cash Position
          </h2>
          <p className="text-sm text-muted-foreground">
            Balances as at the end of the selected period.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Cash on Hand"
            value={formatUgxTotal(cash.cashBalance)}
            help="Money recorded in the Cash account up to the selected end date."
          />
          <MetricCard
            label="Bank Balance"
            value={formatUgxTotal(cash.bankBalance)}
            help="Money recorded in the Bank account up to the selected end date."
          />
          <MetricCard
            label="Total Liquidity"
            value={formatUgxTotal(cash.totalBalance)}
            help="Cash on Hand plus Bank Balance."
          />
        </div>
      </section>

      <section aria-labelledby="pnl-heading" className="space-y-4">
        <div>
          <h2 id="pnl-heading" className="text-lg font-semibold">
            Profit &amp; Loss
          </h2>
          <p className="text-sm text-muted-foreground">
            Activity recorded during {periodLabel.toLowerCase()}.
          </p>
        </div>
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pt-6">
            <ReportStatementHeader
              title="Income Statement"
              period={`For the selected period · ${periodLabel}`}
            />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-semibold">
                  <Definition label="Revenue">
                    Income earned during the selected period, such as sales and
                    transfer revenue.
                  </Definition>
                </h3>
                <StatementTable
                  rows={pnl.revenueItems}
                  totalLabel="Total Revenue"
                  total={pnl.totalRevenue}
                  emptyMessage={`No revenue recorded for ${periodLabel.toLowerCase()}.`}
                />
              </div>
              <div>
                <h3 className="mb-2 font-semibold">
                  <Definition label="Expenses">
                    Costs incurred during the selected period, such as freight,
                    salaries, and inventory losses.
                  </Definition>
                </h3>
                <StatementTable
                  rows={pnl.expenseItems}
                  totalLabel="Total Expenses"
                  total={pnl.totalExpenses}
                  emptyMessage={`No expenses recorded for ${periodLabel.toLowerCase()}.`}
                />
              </div>
            </div>
            <div className="mt-8 border-t-2 pt-4">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-base font-bold">
                  <Definition label="Net Income">
                    Total Revenue minus Total Expenses for the selected period.
                  </Definition>
                </h3>
                <span
                  className={`font-mono text-base font-bold tabular-nums ${
                    new BigNumber(pnl.netIncome).gte(0)
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-destructive'
                  }`}
                >
                  {formatUgxTotal(pnl.netIncome)}
                </span>
              </div>
              <div className="ml-auto mt-1 w-36 border-b-[3px] border-double border-foreground/60" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="balance-sheet-heading" className="space-y-4">
        <div>
          <h2 id="balance-sheet-heading" className="text-lg font-semibold">
            Balance Sheet
          </h2>
          <p className="text-sm text-muted-foreground">
            Financial position as at the selected end date.
          </p>
        </div>
        <Card className="print:border-0 print:shadow-none">
          <CardContent className="pt-6">
            <ReportStatementHeader
              title="Statement of Financial Position"
              period={`As at ${to || 'today'} · ${periodLabel}`}
            />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <BalanceSection
                title="Assets"
                rows={bs.assets.map((row) => ({
                  name: row.name,
                  amount: row.balance,
                }))}
                totalLabel="Total Assets"
                total={bs.totalAssets}
                help="Resources controlled by the business, including cash, bank balances, and inventory-related assets."
              />
              <BalanceSection
                title="Liabilities"
                rows={bs.liabilities.map((row) => ({
                  name: row.name,
                  amount: row.balance,
                }))}
                totalLabel="Total Liabilities"
                total={bs.totalLiabilities}
                help="Amounts the business owes to others."
              />
              <BalanceSection
                title="Equity"
                rows={bs.equity.map((row) => ({
                  name: row.name,
                  amount: row.balance,
                }))}
                totalLabel="Total Equity"
                total={bs.totalEquity}
                help="The owners' residual interest after liabilities are deducted from assets."
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        aria-labelledby="report-hub-heading"
        className="space-y-4 print:hidden"
      >
        <div>
          <h2 id="report-hub-heading" className="text-lg font-semibold">
            All Reports
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose a report by the question it answers.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {reportCards
            .filter((card) => !card.permission || canViewShiftReports)
            .map((card) => {
              const Icon = card.icon
              return (
                <Card key={card.to} className="flex flex-col">
                  <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                    <div className="rounded-md bg-muted p-2">
                      <Icon className="size-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{card.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {card.description}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    <Button asChild variant="outline" size="sm">
                      <Link to={card.to}>
                        {card.to === '/reports'
                          ? 'Review summary'
                          : 'View report'}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  help,
}: {
  label: string
  value: string
  help: string
}) {
  return (
    <Card className="print:border-0 print:shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {label}
          <InfoPopover ariaLabel={`Explain ${label}`}>{help}</InfoPopover>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function BalanceSection({
  title,
  rows,
  totalLabel,
  total,
  help,
}: {
  title: string
  rows: StatementRow[]
  totalLabel: string
  total: string
  help: string
}) {
  return (
    <div>
      <h3 className="mb-2 font-bold text-base">
        <Definition label={title}>{help}</Definition>
      </h3>
      <StatementTable
        rows={rows}
        totalLabel={totalLabel}
        total={total}
        emptyMessage={`No ${title.toLowerCase()} recorded.`}
      />
    </div>
  )
}
