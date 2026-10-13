import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Receipt } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#/components/ui/empty'
import type { DashboardOverview } from '#/lib/dashboard'
import { formatUgx } from '#/lib/format'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Kampala',
})

export function RecentSales({
  sales,
}: {
  sales: DashboardOverview['recentSales']
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Recent sales</CardTitle>
        <CardDescription>
          The latest recorded transactions across your shops.
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/shop/sales">
              View all
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Receipt />
              </EmptyMedia>
              <EmptyTitle>No sales recorded yet</EmptyTitle>
              <EmptyDescription>
                Your most recent shop sales will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="hidden sm:table-cell">Payment</TableHead>
                <TableHead className="text-right">Amount (UGX)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{sale.reference}</span>
                      <span className="text-xs text-muted-foreground">
                        {dateFormat.format(new Date(sale.soldAt))}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{sale.shopName}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline">
                      {sale.paymentMethod.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatUgx(sale.totalAmountUgx)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
