import { createFileRoute } from '@tanstack/react-router'
import BigNumber from 'bignumber.js'
import { requireUiPermission } from '#/lib/permissions'
import {
  roundUgxFloor50,
  roundUgxBankers50,
  formatUgxTotal,
} from '#/lib/format'
import { ResponsiveTable } from '#/components/ui/responsive-table'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Separator } from '#/components/ui/separator'
import { InfoTip } from '#/components/ui/info-tip'
import {
  getProfitAndLoss,
  getBalanceSheet,
  getCashPosition,
} from '#/server/functions/accounting/reports'

export const Route = createFileRoute('/reports/')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'reports.view'),
  loader: async () => {
    const [pnl, bs, cash] = await Promise.all([
      getProfitAndLoss({ data: {} }),
      getBalanceSheet({ data: {} }),
      getCashPosition(),
    ])
    return { pnl, bs, cash }
  },
  component: ReportsDashboard,
})

function ReportsDashboard() {
  const { pnl, bs, cash } = Route.useLoaderData()

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Financial Reports</h1>

      {/* Cash Position */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Cash on Hand
              <InfoTip term="kpi.cashOnHand" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {roundUgxBankers50(cash.cashBalance).toFormat(0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Bank Balance
              <InfoTip term="kpi.bankBalance" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {roundUgxBankers50(cash.bankBalance).toFormat(0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Total Liquidity
              <InfoTip term="kpi.totalLiquidity" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {roundUgxBankers50(cash.totalBalance).toFormat(0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* P&L */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Profit & Loss</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Revenue
            </h3>
            <div className="rounded-md border">
              <ResponsiveTable
                data={pnl.revenueItems}
                getRowKey={(r) => r.name}
                columns={[
                  { header: 'Category', cell: (r) => r.name },
                  {
                    header: 'Amount',
                    align: 'right',
                    cell: (r) => (
                      <span className="font-mono">
                        {roundUgxFloor50(r.amount).toFormat(0)}
                      </span>
                    ),
                  },
                ]}
                emptyMessage="No revenue."
              />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-x border-b rounded-b-md font-bold text-sm">
              <span>Total Revenue</span>
              <span className="font-mono">
                {roundUgxBankers50(pnl.totalRevenue).toFormat(0)}
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Expenses
            </h3>
            <div className="rounded-md border">
              <ResponsiveTable
                data={pnl.expenseItems}
                getRowKey={(e) => e.name}
                columns={[
                  { header: 'Category', cell: (e) => e.name },
                  {
                    header: 'Amount',
                    align: 'right',
                    cell: (e) => (
                      <span className="font-mono">
                        {roundUgxFloor50(e.amount).toFormat(0)}
                      </span>
                    ),
                  },
                ]}
                emptyMessage="No expenses."
              />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-x border-b rounded-b-md font-bold text-sm">
              <span>Total Expenses</span>
              <span className="font-mono">
                {roundUgxBankers50(pnl.totalExpenses).toFormat(0)}
              </span>
            </div>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Net Income</span>
              <span
                className={`text-2xl font-bold font-mono ${
                  new BigNumber(pnl.netIncome).gte(0)
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {formatUgxTotal(pnl.netIncome)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Balance Sheet */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Balance Sheet</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Assets
            </h3>
            <div className="rounded-md border">
              <ResponsiveTable
                data={bs.assets}
                getRowKey={(a) => a.name}
                columns={[
                  { header: 'Account', cell: (a) => a.name },
                  {
                    header: 'Balance',
                    align: 'right',
                    cell: (a) => (
                      <span className="font-mono">
                        {roundUgxFloor50(a.balance).toFormat(0)}
                      </span>
                    ),
                  },
                ]}
                emptyMessage="No assets."
              />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-x border-b rounded-b-md font-bold text-sm">
              <span>Total</span>
              <span className="font-mono">
                {roundUgxBankers50(bs.totalAssets).toFormat(0)}
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Liabilities
            </h3>
            <div className="rounded-md border">
              <ResponsiveTable
                data={bs.liabilities}
                getRowKey={(l) => l.name}
                columns={[
                  { header: 'Account', cell: (l) => l.name },
                  {
                    header: 'Balance',
                    align: 'right',
                    cell: (l) => (
                      <span className="font-mono">
                        {roundUgxFloor50(l.balance).toFormat(0)}
                      </span>
                    ),
                  },
                ]}
                emptyMessage="No liabilities."
              />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-x border-b rounded-b-md font-bold text-sm">
              <span>Total</span>
              <span className="font-mono">
                {roundUgxBankers50(bs.totalLiabilities).toFormat(0)}
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">
              Equity
            </h3>
            <div className="rounded-md border">
              <ResponsiveTable
                data={bs.equity}
                getRowKey={(e) => e.name}
                columns={[
                  { header: 'Account', cell: (e) => e.name },
                  {
                    header: 'Balance',
                    align: 'right',
                    cell: (e) => (
                      <span className="font-mono">
                        {roundUgxFloor50(e.balance).toFormat(0)}
                      </span>
                    ),
                  },
                ]}
                emptyMessage="No equity."
              />
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-x border-b rounded-b-md font-bold text-sm">
              <span>Total</span>
              <span className="font-mono">
                {roundUgxBankers50(bs.totalEquity).toFormat(0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
