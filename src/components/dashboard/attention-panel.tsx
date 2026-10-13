import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowLeftRight,
  CheckCheck,
  PackageSearch,
  Settings2,
  Truck,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#/components/ui/empty'
import { can } from '#/lib/permissions'
import type { SystemPrereqsSummary } from '#/lib/prerequisites/types'
import type { DashboardOverview } from '#/lib/dashboard'

export function AttentionPanel({
  overview,
  summary,
  role,
}: {
  overview: DashboardOverview
  summary: SystemPrereqsSummary
  role?: string
}) {
  const entries = [
    ...(role === 'admin' && summary.failingHard > 0
      ? [
          {
            id: 'setup',
            title: 'Complete your setup',
            description: `${summary.failingHard} ${summary.failingHard === 1 ? 'step needs' : 'steps need'} attention`,
            count: summary.failingHard,
            to: '/settings',
            icon: Settings2,
          },
        ]
      : []),
    ...(can(role, 'notifications.manage')
      ? overview.lowStockLocations
          .filter(
            (location) =>
              location.scope === 'shop' || can(role, 'warehouse.stock'),
          )
          .map((location) => ({
            title: `Low stock · ${location.name}`,
            description: 'Review items that need replenishment',
            count: location.count,
            to:
              location.scope === 'store'
                ? '/store/restock-requisitions'
                : `/shop/${location.locationId}/restock`,
            icon: PackageSearch,
            id: `${location.scope}:${location.locationId}`,
          }))
      : []),
    ...(overview.summary.pendingTransfers > 0
      ? [
          {
            id: 'transfers',
            title: 'Pending stock transfers',
            description: 'Follow stock on its way to a shop',
            count: overview.summary.pendingTransfers,
            to: '/store/transfers',
            icon: ArrowLeftRight,
          },
        ]
      : []),
    ...(overview.openSupplyRoutes
      ? [
          {
            id: 'supply',
            title: 'Open supply routes',
            description: 'Check procurement progress',
            count: overview.openSupplyRoutes,
            to: '/supply',
            icon: Truck,
          },
        ]
      : []),
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Keep the next step in sight.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {entries.length === 0 ? (
          <Empty className="px-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCheck />
              </EmptyMedia>
              <EmptyTitle>You're all caught up</EmptyTitle>
              <EmptyDescription>
                No pending transfers or stock alerts in your workspace.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3">
              <entry.icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{entry.title}</span>
                  <Badge variant="secondary">{entry.count}</Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {entry.description}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" asChild>
                <Link
                  to={entry.to}
                  aria-label={`Review ${entry.title.toLowerCase()}`}
                >
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
