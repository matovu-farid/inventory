import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Package } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
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
import type { ChartConfig } from '#/components/ui/chart'
import type { DashboardOverview } from '#/lib/dashboard'

const config = {
  quantity: { label: 'Units', color: 'var(--chart-1)' },
  warehouse: { label: 'Warehouse', color: 'var(--chart-1)' },
  shop: { label: 'Retail', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function InventoryChart({
  locations,
}: {
  locations: DashboardOverview['locations']
}) {
  const data = locations.map((location) => ({
    ...location,
    fill: `var(--color-${location.kind})`,
  }))
  const total = locations.reduce((sum, location) => sum + location.quantity, 0)
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Stock by location</CardTitle>
        <CardDescription>
          Where your inventory is held right now.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {locations.length === 0 || total === 0 ? (
          <Empty className="min-h-52 px-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Package />
              </EmptyMedia>
              <EmptyTitle>No stock yet</EmptyTitle>
              <EmptyDescription>
                Received stock and opening balances will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            role="img"
            aria-label={locations
              .map(
                (location) =>
                  `${location.name}: ${location.quantity.toLocaleString('en-GB')} units`,
              )
              .join('; ')}
          >
            <ChartContainer
              config={config}
              className="aspect-auto w-full"
              style={{ height: Math.max(180, data.length * 42) }}
            >
              <BarChart
                accessibilityLayer
                data={data}
                layout="vertical"
                margin={{ left: 0, right: 16 }}
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  tickFormatter={(value: string) =>
                    value.length > 15 ? `${value.slice(0, 14)}…` : value
                  }
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideIndicator />}
                />
                <Bar
                  dataKey="quantity"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t text-sm text-muted-foreground">
        <span>
          {total.toLocaleString('en-GB')} units across {locations.length}{' '}
          {locations.length === 1 ? 'location' : 'locations'}
        </span>
        <span>Current stock</span>
      </CardFooter>
    </Card>
  )
}
