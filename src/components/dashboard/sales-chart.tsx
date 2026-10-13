import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#/components/ui/empty'
import { ChartNoAxesCombined } from 'lucide-react'
import type { ChartConfig } from '#/components/ui/chart'

export type SalesChartPoint = { date: string; revenue: number; sales: number }

const config = {
  revenue: { label: 'Sales (UGX)', color: 'var(--chart-1)' },
} satisfies ChartConfig

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Kampala',
  }).format(new Date(`${value}T12:00:00Z`))

export function SalesChart({
  data,
  illustrative = false,
}: {
  data: SalesChartPoint[]
  illustrative?: boolean
}) {
  if (!data.some((point) => point.sales > 0)) {
    return (
      <Empty className="min-h-64">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartNoAxesCombined />
          </EmptyMedia>
          <EmptyTitle>No sales in this period</EmptyTitle>
          <EmptyDescription>
            Recorded sales will appear here. Try a longer date range to see
            earlier activity.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div
      role="region"
      aria-label={
        illustrative
          ? 'Illustrative sales chart with sample data'
          : 'Daily gross sales in Ugandan shillings for the selected period'
      }
    >
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={12}
            minTickGap={28}
            tickFormatter={dateLabel}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={52}
            tickFormatter={(value: number) =>
              new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(
                value,
              )
            }
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => dateLabel(String(value))}
                formatter={(value) => [
                  'UGX ',
                  Number(value).toLocaleString('en-GB', {
                    maximumFractionDigits: 2,
                  }),
                ]}
              />
            }
          />
          <Area
            dataKey="revenue"
            type="monotone"
            fill="var(--color-revenue)"
            fillOpacity={0.1}
            stroke="var(--color-revenue)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
