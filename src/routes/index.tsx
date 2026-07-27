import {
  createFileRoute,
  Link,
  redirect,
  useLoaderData,
  useRouteContext,
} from '@tanstack/react-router'
import {
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Users,
  ArrowLeftRight,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { getSystemPrereqs } from '#/server/functions/prereqs/system'
import { can } from '#/lib/permissions'
import type { Permission } from '#/lib/permissions'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // Sales reps land directly on the shop floor — there's no dashboard
    // content meaningful to them.
    const role = (context.session?.user as { role?: string } | undefined)?.role
    if (role === 'sales') throw redirect({ to: '/shop' })
  },
  loader: async () => {
    const summary = await getSystemPrereqs()
    return { summary }
  },
  component: Home,
})

type QuickAction = {
  to: string
  icon: React.ElementType
  title: string
  description: string
  color: string
  iconColor: string
  permission: Permission
}

const quickActions: QuickAction[] = [
  {
    to: '/supply',
    icon: Truck,
    title: 'Supply Routes',
    description: 'Manage buying trips and track procurement costs',
    color: 'from-blue-500/10 to-blue-600/5',
    iconColor: 'text-blue-600',
    permission: 'procurement.view',
  },
  {
    to: '/supply/suppliers',
    icon: Users,
    title: 'Suppliers',
    description: 'Manage local and international suppliers',
    color: 'from-violet-500/10 to-violet-600/5',
    iconColor: 'text-violet-600',
    permission: 'procurement.view',
  },
  {
    to: '/store',
    icon: Package,
    title: 'Store Stock',
    description: 'View warehouse inventory and stock levels',
    color: 'from-emerald-500/10 to-emerald-600/5',
    iconColor: 'text-emerald-600',
    permission: 'warehouse.stock',
  },
  {
    to: '/store/transfers',
    icon: ArrowLeftRight,
    title: 'Transfers',
    description: 'Transfer goods between locations',
    color: 'from-amber-500/10 to-amber-600/5',
    iconColor: 'text-amber-600',
    permission: 'warehouse.transfers',
  },
  {
    to: '/shop',
    icon: ShoppingCart,
    title: 'Shop & Sales',
    description: 'View shop inventory and record retail sales',
    color: 'from-rose-500/10 to-rose-600/5',
    iconColor: 'text-rose-600',
    permission: 'shop.view',
  },
  {
    to: '/reports',
    icon: BarChart3,
    title: 'Reports',
    description: 'P&L, balance sheet, and cash position',
    color: 'from-cyan-500/10 to-cyan-600/5',
    iconColor: 'text-cyan-600',
    permission: 'reports.view',
  },
]

function Home() {
  const { summary } = useLoaderData({ from: '/' })
  const { session } = useRouteContext({ from: '__root__' })
  const role = (session?.user as { role?: string } | undefined)?.role
  const visibleActions = quickActions.filter((a) => can(role, a.permission))

  return (
    <div className="space-y-6">
      {summary.failingHard > 0 && (
        <Link
          to="/settings"
          className="block rounded-md border border-destructive/40 bg-destructive/5 p-4 text-destructive transition-colors hover:bg-destructive/10"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="size-4" strokeWidth={1.75} />
            <div className="flex-1">
              <p className="text-sm font-medium leading-tight">
                {summary.failingHard} setup{' '}
                {summary.failingHard === 1 ? 'step needs' : 'steps need'}{' '}
                attention
              </p>
              <p className="text-[13px] opacity-90">
                Open the Setup Checklist to see what's missing.
              </p>
            </div>
            <ArrowRight className="size-4" strokeWidth={1.75} />
          </div>
        </Link>
      )}

      {/* Welcome */}
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your inventory management overview
        </p>
      </div>

      {/* Quick access */}
      <section>
        <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="group relative rounded-2xl bg-card p-5 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                boxShadow: 'var(--shadow-card)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'var(--shadow-card)'
              }}
            >
              {/* Icon */}
              <div
                className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${action.color}`}
              >
                <action.icon
                  className={`size-[20px] ${action.iconColor}`}
                  strokeWidth={1.75}
                />
              </div>

              {/* Text */}
              <p className="mt-3.5 text-[14px] font-semibold tracking-[-0.01em] text-foreground">
                {action.title}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {action.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
