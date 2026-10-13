import { Fragment } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import { Separator } from '#/components/ui/separator'
import { SidebarTrigger } from '#/components/ui/sidebar'
import {
  getActiveNavPath,
  getAppBreadcrumbs,
  getNavigationGroups,
} from '#/lib/app-navigation'
import { can } from '#/lib/permissions'
import { cn } from '#/lib/utils'

export function AppHeader({ userRole }: { userRole: string }) {
  const { pathname } = useLocation()
  const breadcrumbs = getAppBreadcrumbs(pathname)
  const navigation = getNavigationGroups(userRole)

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 lg:px-6">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {breadcrumbs.map((crumb, index) => {
            const isCurrent = index === breadcrumbs.length - 1
            return (
              <Fragment key={crumb.to}>
                {index > 0 && (
                  <BreadcrumbSeparator className="hidden sm:block" />
                )}
                <BreadcrumbItem
                  className={cn(
                    'min-w-0',
                    !isCurrent && 'hidden sm:inline-flex',
                  )}
                >
                  {isCurrent ? (
                    <BreadcrumbPage className="truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : getActiveNavPath(crumb.to, navigation) ? (
                    <BreadcrumbLink asChild className="truncate">
                      <Link to={crumb.to} activeOptions={{ exact: true }}>
                        {crumb.label}
                      </Link>
                    </BreadcrumbLink>
                  ) : (
                    <span className="truncate">{crumb.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {can(userRole, 'notifications.manage') && (
        <Button variant="ghost" size="icon-sm" asChild>
          <Link to="/settings/notifications" aria-label="Notification settings">
            <Bell />
          </Link>
        </Button>
      )}
    </header>
  )
}
