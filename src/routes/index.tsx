import { createFileRoute, Link, useLoaderData } from "@tanstack/react-router"
import {
  Package,
  ShoppingCart,
  Truck,
  BarChart3,
  Users,
  ArrowLeftRight,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { getSystemPrereqs } from "#/server/functions/prereqs/system"

export const Route = createFileRoute("/")({
  loader: async () => {
    const summary = await getSystemPrereqs()
    return { summary }
  },
  component: Home,
})

const quickActions = [
  {
    to: "/supply" as const,
    icon: Truck,
    title: "Supply Routes",
    description: "Manage buying trips and track procurement costs",
    color: "from-blue-500/10 to-blue-600/5",
    iconColor: "text-blue-600",
  },
  {
    to: "/supply/suppliers" as const,
    icon: Users,
    title: "Suppliers",
    description: "Manage local and international suppliers",
    color: "from-violet-500/10 to-violet-600/5",
    iconColor: "text-violet-600",
  },
  {
    to: "/store" as const,
    icon: Package,
    title: "Store Stock",
    description: "View warehouse inventory and stock levels",
    color: "from-emerald-500/10 to-emerald-600/5",
    iconColor: "text-emerald-600",
  },
  {
    to: "/store/transfers" as const,
    icon: ArrowLeftRight,
    title: "Transfers",
    description: "Transfer goods between locations",
    color: "from-amber-500/10 to-amber-600/5",
    iconColor: "text-amber-600",
  },
  {
    to: "/shop" as const,
    icon: ShoppingCart,
    title: "Shop & Sales",
    description: "View shop inventory and record retail sales",
    color: "from-rose-500/10 to-rose-600/5",
    iconColor: "text-rose-600",
  },
  {
    to: "/reports" as const,
    icon: BarChart3,
    title: "Reports",
    description: "P&L, balance sheet, and cash position",
    color: "from-cyan-500/10 to-cyan-600/5",
    iconColor: "text-cyan-600",
  },
]

function Home() {
  const { summary } = useLoaderData({ from: "/" })

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
                {summary.failingHard} setup{" "}
                {summary.failingHard === 1 ? "step needs" : "steps need"}{" "}
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
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="group relative rounded-2xl bg-card p-5 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                boxShadow: "var(--shadow-card)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "var(--shadow-card)"
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
