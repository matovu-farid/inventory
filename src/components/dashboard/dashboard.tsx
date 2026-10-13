import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  Package,
  ShoppingBag,
  Tags,
} from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { can } from '#/lib/permissions'
import { getDashboardPeriod } from '#/lib/dashboard'
import { formatUgxTotal } from '#/lib/format'
import { SalesChart } from './sales-chart'
import { InventoryChart } from './inventory-chart'
import { RecentSales } from './recent-sales'
import { AttentionPanel } from './attention-panel'
import { WorkspaceLinks } from './workspace-links'
import type { SystemPrereqsSummary } from '#/lib/prerequisites/types'
import type { DashboardOverview } from '#/lib/dashboard'

const numberFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
})

export function Dashboard({
  overview,
  summary,
  role,
  userName,
}: {
  overview: DashboardOverview
  summary: SystemPrereqsSummary
  role?: string
  userName: string
}) {
  const [period, setPeriod] = useState('30')
  const selected = getDashboardPeriod(
    overview.salesSeries,
    Number(period),
    overview.asOfDate,
  )
  const isAdmin = can(role, 'warehouse.stock')
  const metrics = [
    {
      label: 'Gross sales',
      value: formatUgxTotal(selected.revenueUgx),
      detail: `${numberFormat.format(selected.sales)} ${selected.sales === 1 ? 'sale' : 'sales'} in the last ${period} days`,
      icon: ShoppingBag,
      to: '/shop/sales',
    },
    {
      label: 'Retail stock',
      value: numberFormat.format(overview.summary.shopUnits),
      detail: 'Units available across your shops',
      icon: ShoppingBag,
      to: '/shop',
    },
    isAdmin
      ? {
          label: 'Warehouse stock',
          value: numberFormat.format(overview.summary.warehouseUnits ?? 0),
          detail: 'Units on hand in the warehouse',
          icon: Package,
          to: '/store',
        }
      : {
          label: 'Item catalog',
          value: numberFormat.format(overview.summary.catalogItems),
          detail: 'Items in your product catalog',
          icon: Tags,
          to: '/items',
        },
    {
      label: 'Pending transfers',
      value: numberFormat.format(overview.summary.pendingTransfers),
      detail: 'Pending or dispatched to shops',
      icon: ArrowLeftRight,
      to: '/store/transfers',
    },
  ]

  return (
    <Tabs value={period} onValueChange={setPeriod} className="gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {userName.split(' ')[0]}. Here's your business at a
            glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays className="size-4" />
            {new Intl.DateTimeFormat('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'Africa/Kampala',
            }).format(new Date(`${overview.asOfDate}T12:00:00Z`))}
          </span>
          <TabsList aria-label="Sales reporting period">
            <TabsTrigger value="7">7 days</TabsTrigger>
            <TabsTrigger value="30">30 days</TabsTrigger>
            <TabsTrigger value="90">90 days</TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value={period} className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label} className="gap-4">
              <CardHeader>
                <CardDescription>{metric.label}</CardDescription>
                <CardAction>
                  <metric.icon className="size-4 text-muted-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="break-words text-2xl font-semibold tracking-tight tabular-nums">
                  {metric.value}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {metric.detail}
                </p>
              </CardContent>
              <CardFooter>
                <Button variant="link" size="sm" asChild className="h-auto p-0">
                  <Link to={metric.to}>
                    View details
                    <ArrowUpRight data-icon="inline-end" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Sales overview</CardTitle>
                <CardDescription>
                  Daily gross sales for the last {period} days, in UGX.
                </CardDescription>
                <CardAction>
                  <Badge variant="outline">
                    {selected.sales} {selected.sales === 1 ? 'sale' : 'sales'}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <SalesChart data={selected.series} />
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-2 border-t text-xs text-muted-foreground">
                <span>Gross recorded sales before returns</span>
                <span>All shops · Kampala time</span>
              </CardFooter>
            </Card>
            <RecentSales sales={overview.recentSales} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <AttentionPanel overview={overview} summary={summary} role={role} />
            <InventoryChart locations={overview.locations} />
            <WorkspaceLinks role={role} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
