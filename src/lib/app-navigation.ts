import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  PackageCheck,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { can } from '#/lib/permissions'
import type { Permission } from '#/lib/permissions'

export interface AppNavItem {
  label: string
  to: string
  icon: LucideIcon
  permission?: Permission
}

export interface AppNavGroup {
  title: string
  items: AppNavItem[]
}

const navigationGroups: AppNavGroup[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard }],
  },
  {
    title: 'Procurement',
    items: [
      {
        label: 'Supply routes',
        to: '/supply',
        icon: Truck,
        permission: 'procurement.view',
      },
      {
        label: 'Suppliers',
        to: '/supply/suppliers',
        icon: Users,
        permission: 'procurement.view',
      },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { label: 'Items', to: '/items', icon: Tags, permission: 'items.view' },
    ],
  },
  {
    title: 'Warehouse',
    items: [
      {
        label: 'Stock',
        to: '/store',
        icon: Package,
        permission: 'warehouse.stock',
      },
      {
        label: 'Receiving',
        to: '/store/receiving',
        icon: ClipboardList,
        permission: 'warehouse.receiving',
      },
      {
        label: 'Transfers',
        to: '/store/transfers',
        icon: ArrowLeftRight,
        permission: 'warehouse.transfers',
      },
    ],
  },
  {
    title: 'Retail',
    items: [
      { label: 'Shop', to: '/shop', icon: Store, permission: 'shop.view' },
      {
        label: 'Sales',
        to: '/shop/sales',
        icon: ShoppingCart,
        permission: 'sales.view',
      },
      {
        label: 'Customers',
        to: '/customers',
        icon: Users,
        permission: 'customers.view',
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      {
        label: 'Reports',
        to: '/reports',
        icon: BarChart3,
        permission: 'reports.view',
      },
      {
        label: 'Ledger',
        to: '/reports/ledger',
        icon: BookOpen,
        permission: 'reports.view',
      },
      {
        label: 'X report',
        to: '/reports/x',
        icon: ClipboardList,
        permission: 'shift.reports.view',
      },
      {
        label: 'Z reports',
        to: '/reports/z',
        icon: Receipt,
        permission: 'shift.reports.view',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'Users',
        to: '/settings/users',
        icon: UserCog,
        permission: 'users.manage',
      },
      {
        label: 'Audit log',
        to: '/settings/audit-log',
        icon: History,
        permission: 'audit.view',
      },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
]

const salesNavigation: AppNavGroup[] = [
  {
    title: 'Point of sale',
    items: [
      { label: 'POS', to: '/pos', icon: ShoppingCart, permission: 'pos.view' },
      {
        label: 'Sales history',
        to: '/shop/sales',
        icon: Receipt,
        permission: 'sales.view',
      },
      {
        label: 'Receive transfers',
        to: '/shop',
        icon: PackageCheck,
        permission: 'shop.view',
      },
    ],
  },
]

export function canViewAppSettings(role: string) {
  return role === 'admin' || role === 'supervisor'
}

export function getNavigationGroups(role: string): AppNavGroup[] {
  if (role !== 'sales' && !canViewAppSettings(role)) return []
  return (role === 'sales' ? salesNavigation : navigationGroups)
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permission || can(role, item.permission),
      ),
    }))
    .filter((group) => group.items.length > 0)
}

/** A detail route belongs to the longest matching visible destination. */
export function getActiveNavPath(
  pathname: string,
  groups: AppNavGroup[],
): string | undefined {
  const path = pathname.replace(/\/+$/, '') || '/'
  return groups
    .flatMap((group) => group.items)
    .filter(
      (item) =>
        path === item.to || (item.to !== '/' && path.startsWith(`${item.to}/`)),
    )
    .sort((a, b) => b.to.length - a.to.length)[0]?.to
}

export interface AppBreadcrumb {
  label: string
  to: string
}

const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  '/pos': 'Point of sale',
  '/supply': 'Supply routes',
  '/supply/new': 'New supply route',
  '/supply/suppliers': 'Suppliers',
  '/items': 'Items',
  '/items/new': 'New item',
  '/store': 'Stock',
  '/store/receiving': 'Receiving',
  '/store/transfers': 'Transfers',
  '/store/opening-balance': 'Opening balance',
  '/store/restock-requisitions': 'Restock requisitions',
  '/shop': 'Shop',
  '/shop/sales': 'Sales',
  '/shop/opening-balance': 'Opening balance',
  '/customers': 'Customers',
  '/reports': 'Reports',
  '/reports/ledger': 'Ledger',
  '/reports/x': 'X report',
  '/reports/z': 'Z reports',
  '/settings': 'Settings',
  '/settings/users': 'Users',
  '/settings/audit-log': 'Audit log',
  '/settings/notifications': 'Notifications',
}

export function getAppBreadcrumbs(pathname: string): AppBreadcrumb[] {
  const path = pathname.replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean)
  const breadcrumbs: AppBreadcrumb[] = []
  if (path === '/') return [{ label: 'Dashboard', to: '/' }]

  for (let index = 0; index < parts.length; index++) {
    const to = `/${parts.slice(0, index + 1).join('/')}`
    const label = routeLabels[to]
    if (label) breadcrumbs.push({ label, to })
    else if (index === parts.length - 1) {
      const detailLabels: Record<string, string> = {
        items: 'Item details',
        supply:
          parts[1] === 'wizard'
            ? 'Edit supply route'
            : parts[2] === 'entry'
              ? 'Stock entry'
              : 'Route details',
        shop: 'Restock shop',
        reports: 'Z report details',
        settings: 'Shop overrides',
      }
      breadcrumbs.push({ label: detailLabels[parts[0]] ?? 'Page', to })
    } else if (parts[0] === 'supply' && index === 1 && parts[1] !== 'wizard') {
      breadcrumbs.push({ label: 'Route details', to })
    }
  }
  return breadcrumbs
}
