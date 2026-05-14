import { useState, useEffect, createContext } from "react"
import { Link } from "@tanstack/react-router"
import {
  LayoutDashboard,
  Package,
  Tags,
  Truck,
  Users,
  ClipboardList,
  ArrowLeftRight,
  Store,
  ShoppingCart,
  Receipt,
  PackageCheck,
  BarChart3,
  BookOpen,
  Settings,
  UserCog,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"
import { cn } from "#/lib/utils"
import { can  } from "#/lib/permissions"
import type {Permission} from "#/lib/permissions";
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { ScrollArea } from "#/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "#/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet"

// ---------------------------------------------------------------------------
// Types & navigation data
// ---------------------------------------------------------------------------

interface AppSidebarProps {
  userName: string
  userRole: string
  onLogout: () => void
  /** Count of system prereq pages with ≥1 hard failure. Hidden when 0. */
  pendingHardCount?: number
}

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
  /** When set, the link is only rendered for roles holding this permission. */
  permission?: Permission
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: "Procurement",
    items: [
      { label: "Supply Routes", to: "/supply", icon: Truck, permission: "procurement.view" },
      { label: "Suppliers", to: "/supply/suppliers", icon: Users, permission: "procurement.view" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", to: "/products", icon: Tags, permission: "products.view" },
    ],
  },
  {
    title: "Warehouse",
    items: [
      { label: "Stock", to: "/store", icon: Package, permission: "warehouse.stock" },
      { label: "Receiving", to: "/store/receiving", icon: ClipboardList, permission: "warehouse.receiving" },
      { label: "Transfers", to: "/store/transfers", icon: ArrowLeftRight, permission: "warehouse.transfers" },
    ],
  },
  {
    title: "Retail",
    items: [
      { label: "Shop", to: "/shop", icon: Store, permission: "shop.view" },
      { label: "Sales", to: "/shop/sales", icon: ShoppingCart, permission: "sales.view" },
      { label: "Customers", to: "/customers", icon: Users, permission: "customers.view" },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Reports", to: "/reports", icon: BarChart3, permission: "reports.view" },
      { label: "Ledger", to: "/reports/ledger", icon: BookOpen, permission: "reports.view" },
      { label: "X Report", to: "/reports/x", icon: ClipboardList, permission: "shift.reports.view" },
      { label: "Z Reports", to: "/reports/z", icon: Receipt, permission: "shift.reports.view" },
    ],
  },
]

const SALES_NAV_GROUP: NavGroup = {
  title: "POS",
  items: [
    { label: "POS", to: "/pos", icon: ShoppingCart, permission: "pos.view" },
    { label: "Sales history", to: "/shop/sales", icon: Receipt, permission: "sales.view" },
    { label: "Receive transfers", to: "/shop", icon: PackageCheck, permission: "shop.view" },
  ],
}

function visibleGroups(role: string): NavGroup[] {
  if (role === "sales") {
    return [SALES_NAV_GROUP]
  }
  return navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !i.permission || can(role, i.permission)),
    }))
    .filter((g) => g.items.length > 0)
}

const dashboardItem: NavItem = {
  label: "Dashboard",
  to: "/",
  icon: LayoutDashboard,
}

const settingsItem: NavItem = {
  label: "Settings",
  to: "/settings",
  icon: Settings,
}

const usersItem: NavItem = {
  label: "Users",
  to: "/settings/users",
  icon: UserCog,
}

// ---------------------------------------------------------------------------
// Context – shared collapsed state
// ---------------------------------------------------------------------------

const SidebarContext = createContext({ collapsed: false })

// ---------------------------------------------------------------------------
// Collapsed state persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = "sidebar-collapsed"

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, v ? "1" : "0")
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// ---------------------------------------------------------------------------
// NavLink
// ---------------------------------------------------------------------------

function NavLink({
  item,
  collapsed,
  onClick,
  badge,
}: {
  item: NavItem
  collapsed: boolean
  onClick?: () => void
  badge?: number
}) {
  const Icon = item.icon

  const link = (
    <Link
      to={item.to}
      onClick={onClick}
      activeOptions={{ exact: true }}
      className={cn(
        "group/link relative flex items-center rounded-lg text-[13px] font-medium",
        "text-sidebar-foreground/60 transition-all duration-150",
        "hover:bg-black/[0.04] hover:text-sidebar-foreground",
        "[&.active]:bg-[oklch(0.546_0.245_262.88/0.08)] [&.active]:text-[oklch(0.42_0.18_262.88)] [&.active]:font-semibold",
        collapsed ? "mx-auto size-10 justify-center" : "gap-3 px-3 py-[7px]",
      )}
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0 transition-colors duration-150",
          "group-[&.active]/link:text-[oklch(0.48_0.2_262.88)]",
        )}
        strokeWidth={1.75}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
          {badge}
        </span>
      )}
      {collapsed && badge !== undefined && badge > 0 && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" />
      )}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={12}
          className="rounded-lg px-3 py-1.5 text-xs font-medium shadow-md"
        >
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }
  return link
}

// ---------------------------------------------------------------------------
// SidebarNav – rendered in both desktop and mobile
// ---------------------------------------------------------------------------

function SidebarNav({
  collapsed,
  onItemClick,
  groups,
  showDashboard,
}: {
  collapsed: boolean
  onItemClick?: () => void
  groups: NavGroup[]
  showDashboard: boolean
}) {
  return (
    <nav className={cn("flex flex-col", collapsed ? "gap-1 px-2" : "gap-5 px-3")}>
      {showDashboard && (
        <div className="flex flex-col gap-0.5">
          <NavLink
            item={dashboardItem}
            collapsed={collapsed}
            onClick={onItemClick}
          />
        </div>
      )}
      {groups.map((group) => (
        <div key={group.title}>
          {!collapsed && (
            <p className="mb-1 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/35 select-none">
              {group.title}
            </p>
          )}
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                collapsed={collapsed}
                onClick={onItemClick}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// UserFooter
// ---------------------------------------------------------------------------

function UserFooter({
  userName: name,
  userRole: role,
  onLogout,
  collapsed,
}: AppSidebarProps & { collapsed: boolean }) {
  const avatar = (
    <Avatar className="size-8">
      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-[11px] font-semibold text-primary">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-default">{avatar}</div>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={12}
            className="rounded-lg px-3 py-1.5 text-xs shadow-md"
          >
            <p className="font-medium">{name}</p>
            {role && <p className="text-[11px] opacity-60">{role}</p>}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onLogout}
              className="text-sidebar-foreground/40 hover:text-destructive"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            sideOffset={12}
            className="rounded-lg px-3 py-1.5 text-xs shadow-md"
          >
            Sign out
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-sidebar-foreground">
          {name}
        </p>
        {role && (
          <p className="truncate text-[11px] text-sidebar-foreground/45">
            {role}
          </p>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onLogout}
            className="shrink-0 text-sidebar-foreground/40 hover:text-destructive"
          >
            <LogOut className="size-4" strokeWidth={1.75} />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="rounded-lg px-3 py-1.5 text-xs shadow-md"
        >
          Sign out
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AppSidebar
// ---------------------------------------------------------------------------

function AppSidebar({ userName, userRole, onLogout, pendingHardCount }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const groups = visibleGroups(userRole)
  const showDashboard = userRole !== "sales"

  useEffect(() => {
    writeCollapsed(collapsed)
  }, [collapsed])

  return (
    <SidebarContext.Provider value={{ collapsed }}>
      {/* The actual sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed inset-y-0 left-0 z-30",
          "bg-sidebar border-r border-sidebar-border",
          "transition-[width] duration-250 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
          collapsed ? "w-[68px]" : "w-[240px]",
        )}
      >
        {/* ── Header ── */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center",
            collapsed ? "justify-center px-2" : "justify-between pl-5 pr-2",
          )}
        >
          {/* Brand */}
          <Link
            to="/"
            aria-label="Go to dashboard"
            className="flex items-center gap-2.5 overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo className="size-8" />
            {!collapsed && (
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
                Inventory
              </span>
            )}
          </Link>

          {/* Collapse toggle – always visible */}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCollapsed(true)}
                  className="text-sidebar-foreground/35 hover:text-sidebar-foreground/70 hover:bg-black/[0.04]"
                >
                  <PanelLeftClose className="size-[18px]" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={4} className="rounded-lg px-3 py-1.5 text-xs shadow-md">
                Collapse
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* ── Expand button when collapsed ── */}
        {collapsed && (
          <div className="flex justify-center pb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setCollapsed(false)}
                  className="text-sidebar-foreground/35 hover:text-sidebar-foreground/70 hover:bg-black/[0.04]"
                >
                  <PanelLeft className="size-[18px]" strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={12} className="rounded-lg px-3 py-1.5 text-xs shadow-md">
                Expand
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Navigation ── */}
        <ScrollArea className="min-h-0 flex-1 py-2">
          <SidebarNav
            collapsed={collapsed}
            groups={groups}
            showDashboard={showDashboard}
          />
        </ScrollArea>

        {/* ── Admin (pinned above user) ── */}
        {userRole !== "sales" && (
          <div
            className={cn(
              "shrink-0 flex flex-col gap-0.5 border-t border-sidebar-border",
              collapsed ? "px-2 py-2" : "px-3 py-2",
            )}
          >
            {userRole === "admin" && (
              <NavLink item={usersItem} collapsed={collapsed} />
            )}
            <NavLink item={settingsItem} collapsed={collapsed} badge={pendingHardCount} />
          </div>
        )}

        {/* ── User ── */}
        <div className="shrink-0 border-t border-sidebar-border">
          <UserFooter
            userName={userName}
            userRole={userRole}
            onLogout={onLogout}
            collapsed={collapsed}
          />
        </div>
      </aside>

      {/* Spacer – pushes main content right */}
      <div
        className={cn(
          "hidden md:block shrink-0",
          "transition-[width] duration-250 ease-[cubic-bezier(0.25,0.1,0.25,1)]",
          collapsed ? "w-[68px]" : "w-[240px]",
        )}
        aria-hidden
      />
    </SidebarContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// SidebarTrigger – mobile hamburger + sheet
// ---------------------------------------------------------------------------

function SidebarTrigger({ userName, userRole, onLogout, pendingHardCount }: AppSidebarProps) {
  const [open, setOpen] = useState(false)
  const groups = visibleGroups(userRole)
  const showDashboard = userRole !== "sales"

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="size-5" strokeWidth={1.75} />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[280px] flex-col p-0 bg-sidebar border-r-0"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>

        {/* Brand */}
        <Link
          to="/"
          aria-label="Go to dashboard"
          onClick={() => setOpen(false)}
          className="flex h-14 shrink-0 items-center gap-2.5 px-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo className="size-8" />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
            Inventory
          </span>
        </Link>

        {/* Navigation */}
        <ScrollArea className="min-h-0 flex-1 py-2">
          <SidebarNav
            collapsed={false}
            onItemClick={() => setOpen(false)}
            groups={groups}
            showDashboard={showDashboard}
          />
        </ScrollArea>

        {/* Admin */}
        {userRole !== "sales" && (
          <div className="shrink-0 flex flex-col gap-0.5 border-t border-sidebar-border px-3 py-2">
            {userRole === "admin" && (
              <NavLink
                item={usersItem}
                collapsed={false}
                onClick={() => setOpen(false)}
              />
            )}
            <NavLink
              item={settingsItem}
              collapsed={false}
              onClick={() => setOpen(false)}
              badge={pendingHardCount}
            />
          </div>
        )}

        {/* User */}
        <div className="shrink-0 border-t border-sidebar-border">
          <UserFooter
            userName={userName}
            userRole={userRole}
            onLogout={() => {
              setOpen(false)
              onLogout()
            }}
            collapsed={false}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { AppSidebar, SidebarTrigger }
export type { AppSidebarProps }
