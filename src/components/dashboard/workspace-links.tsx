import { Link } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Package,
  ShoppingCart,
  Tags,
  Truck,
  Users,
} from 'lucide-react'
import { can } from '#/lib/permissions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import type { Permission } from '#/lib/permissions'

const actions = [
  { to: '/items', icon: Tags, title: 'Item catalog', permission: 'items.view' },
  {
    to: '/supply',
    icon: Truck,
    title: 'Supply routes',
    permission: 'procurement.view',
  },
  {
    to: '/supply/suppliers',
    icon: Users,
    title: 'Suppliers',
    permission: 'procurement.view',
  },
  {
    to: '/store',
    icon: Package,
    title: 'Warehouse stock',
    permission: 'warehouse.stock',
  },
  {
    to: '/store/transfers',
    icon: ArrowLeftRight,
    title: 'Stock transfers',
    permission: 'warehouse.transfers',
  },
  {
    to: '/shop',
    icon: ShoppingCart,
    title: 'Shop & sales',
    permission: 'shop.view',
  },
  {
    to: '/reports',
    icon: BarChart3,
    title: 'Financial reports',
    permission: 'reports.view',
  },
] satisfies Array<{
  to: string
  icon: React.ElementType
  title: string
  permission: Permission
}>

export function WorkspaceLinks({ role }: { role?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your workspace</CardTitle>
        <CardDescription>Pick up where the work happens.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {actions
          .filter((action) => can(role, action.permission))
          .map((action) => (
            <Button
              key={action.to}
              variant="ghost"
              asChild
              className="w-full justify-start"
            >
              <Link to={action.to}>
                <action.icon data-icon="inline-start" />
                <span className="flex-1 text-left">{action.title}</span>
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          ))}
      </CardContent>
    </Card>
  )
}
