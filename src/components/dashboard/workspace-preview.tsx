import { PackageCheck, ArrowLeftRight, ShoppingBag } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Badge } from '#/components/ui/badge'
import { Separator } from '#/components/ui/separator'
import { SalesChart } from './sales-chart'

const sampleSales = [
  { date: '2026-08-18', revenue: 240000, sales: 6 },
  { date: '2026-08-19', revenue: 380000, sales: 9 },
  { date: '2026-08-20', revenue: 310000, sales: 8 },
  { date: '2026-08-21', revenue: 540000, sales: 12 },
  { date: '2026-08-22', revenue: 430000, sales: 10 },
  { date: '2026-08-23', revenue: 620000, sales: 15 },
  { date: '2026-08-24', revenue: 760000, sales: 18 },
]

export function WorkspacePreview() {
  return (
    <Card className="min-w-0 gap-5 shadow-lg">
      <CardHeader>
        <CardTitle>Inventory overview</CardTitle>
        <CardDescription>A clearer view of your day.</CardDescription>
        <CardAction>
          <Badge variant="outline">Sample workspace</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-3 gap-4">
          {[
            ['1,284', 'Stock units'],
            ['UGX 3.28m', 'Weekly sales'],
            ['7', 'Transfers'],
          ].map(([value, label]) => (
            <div key={label} className="flex flex-col gap-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tracking-tight tabular-nums sm:text-2xl">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <Separator />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Sales overview</p>
            <span className="text-xs text-muted-foreground">Last 7 days</span>
          </div>
          <SalesChart data={sampleSales} illustrative />
        </div>
        <Separator />
        <div className="flex flex-col gap-4">
          {[
            {
              icon: PackageCheck,
              title: 'Stock received',
              detail: '12 items added to the warehouse',
            },
            {
              icon: ArrowLeftRight,
              title: 'Transfer dispatched',
              detail: 'Warehouse → Shop 01',
            },
            {
              icon: ShoppingBag,
              title: 'Sale recorded',
              detail: 'UGX 180,000 · Shop 01',
            },
          ].map((activity) => (
            <div key={activity.title} className="flex items-center gap-3">
              <activity.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-xs font-medium">
                {activity.title}
              </span>
              <span className="text-right text-xs text-muted-foreground">
                {activity.detail}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="border-t text-xs text-muted-foreground">
        Illustrative data. Your workspace shows your actual stock and sales.
      </CardFooter>
    </Card>
  )
}
