import { useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronsUpDown, LogOut, Settings } from 'lucide-react'
import { Logo, LogoWordmark } from '#/components/logo'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from '#/components/ui/sidebar'
import {
  canViewAppSettings,
  getActiveNavPath,
  getNavigationGroups,
} from '#/lib/app-navigation'

interface AppSidebarProps {
  userName: string
  userRole: string
  userEmail?: string
  userImage?: string | null
  onLogout: () => void
  /** Number of setup pages with a hard prerequisite failure. */
  pendingHardCount?: number
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  )
}

function AppSidebar({
  userName,
  userRole,
  userEmail,
  userImage,
  onLogout,
  pendingHardCount = 0,
}: AppSidebarProps) {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const groups = getNavigationGroups(userRole)
  const activePath = getActiveNavPath(pathname, groups)
  const homePath = userRole === 'sales' ? '/pos' : '/'
  const closeNavigation = () => setOpenMobile(false)

  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Inventory">
              <Link
                to={homePath}
                activeOptions={{ exact: true }}
                onClick={closeNavigation}
                aria-label="Inventory home"
              >
                <Logo className="size-8" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <LogoWordmark className="truncate text-2xl" />
                  <span className="truncate text-xs text-muted-foreground">
                    Operations workspace
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <nav aria-label="Main navigation">
          {groups.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={activePath === item.to}
                        tooltip={item.label}
                      >
                        <Link
                          to={item.to}
                          activeOptions={{ exact: true }}
                          onClick={closeNavigation}
                          aria-current={
                            activePath === item.to ? 'page' : undefined
                          }
                          activeProps={{ className: '' }}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.to === '/settings' && pendingHardCount > 0 && (
                        <SidebarMenuBadge
                          aria-label={`${pendingHardCount} setup checks need attention`}
                        >
                          {pendingHardCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  aria-label={`Account menu for ${userName}`}
                >
                  <Avatar>
                    {userImage && (
                      <AvatarImage src={userImage} alt={userName} />
                    )}
                    <AvatarFallback>{initials(userName)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{userName}</span>
                    <span className="truncate text-xs text-muted-foreground capitalize">
                      {userRole || 'Account'}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? 'bottom' : 'right'}
                align="end"
                sideOffset={4}
                className="min-w-56"
              >
                <DropdownMenuLabel>
                  <div className="grid gap-1">
                    <span className="truncate">{userName}</span>
                    {userEmail && (
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {userEmail}
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {canViewAppSettings(userRole) && (
                    <DropdownMenuItem asChild>
                      <Link to="/settings" onClick={closeNavigation}>
                        <Settings />
                        Account settings
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      closeNavigation()
                      onLogout()
                    }}
                  >
                    <LogOut />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export { AppSidebar }
export type { AppSidebarProps }
