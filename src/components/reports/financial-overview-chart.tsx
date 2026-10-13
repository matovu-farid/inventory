import { ChartNoAxesColumn } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import type { ChartConfig } from '#/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { formatUgxTotal } from '#/lib/format'

const chartConfig = {
  revenue: { label: 'Revenue', color: 'var(--chart-1)' },
  expenses: { label: 'Expenses', color: 'var(--chart-2)' },
  netIncome: { label: 'Net income', color: 'var(--chart-3)' },
} satisfies ChartConfig

type FinancialMetric = keyof typeof chartConfig

export function FinancialOverviewChart({
  totalRevenue,
  totalExpenses,
  netIncome,
  periodLabel,
}: {
  totalRevenue: string
  totalExpenses: string
  netIncome: string
  periodLabel: string
}) {
  const data = [
    { metric: 'revenue' as const, rawAmount: totalRevenue },
    { metric: 'expenses' as const, rawAmount: totalExpenses },
    { metric: 'netIncome' as const, rawAmount: netIncome },
  ].map((point) => ({
    ...point,
    amount: Number(point.rawAmount),
    fill: `var(--color-${point.metric})`,
  }))
  const allZero = data.every((point) => point.amount === 0)

  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Financial overview</CardTitle>
        <CardDescription>{periodLabel} · UGX</CardDescription>
      </CardHeader>
      <CardContent>
        {allZero ? (
          <Empty className="min-h-56">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartNoAxesColumn />
              </EmptyMedia>
              <EmptyTitle>No totals to compare</EmptyTitle>
              <EmptyDescription>
                Revenue, expenses, and net income are all zero for this period.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            role="region"
            aria-label={`Revenue, expenses, and net income for ${periodLabel}, in Ugandan shillings`}
          >
            <dl className="sr-only">
              {data.map((point) => (
                <div key={point.metric}>
                  <dt>{chartConfig[point.metric].label}</dt>
                  <dd>{formatUgxTotal(point.rawAmount)}</dd>
                </div>
              ))}
            </dl>
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-56 w-full"
            >
              <BarChart
                accessibilityLayer
                data={data}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="metric"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tickFormatter={(value: FinancialMetric) =>
                    chartConfig[value].label
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(value: number) =>
                    new Intl.NumberFormat('en-UG', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(value)
                  }
                />
                <ReferenceLine y={0} stroke="var(--border)" />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      nameKey="metric"
                      formatter={(_value, _name, item) => {
                        const point = data.find(
                          (entry) => entry.metric === item.payload?.metric,
                        )
                        return point ? (
                          <span className="font-mono tabular-nums">
                            {formatUgxTotal(point.rawAmount)}
                          </span>
                        ) : null
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="amount"
                  radius={4}
                  maxBarSize={96}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
