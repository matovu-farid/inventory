import { useEffect } from 'react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useMatches,
  useLocation,
} from '@tanstack/react-router'

import { TooltipProvider } from '#/components/ui/tooltip'
import { ErrorDialogProvider } from '#/components/error-dialog-provider'
import { NotFoundPage, RouteErrorPage } from '#/components/error-pages'
import { AppSidebar } from '#/components/app-sidebar'
import { AppHeader } from '#/components/app-header'
import { SidebarInset, SidebarProvider } from '#/components/ui/sidebar'
import { PortalRoot } from '#/components/ui/portal-root'
import { getSession } from '#/server/middleware/auth'
import { authClient } from '#/lib/auth-client'
import { getSystemPrereqs } from '#/server/functions/prereqs/system'
import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'Inventory Management' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=2' },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  beforeLoad: async () => {
    const session = await getSession()
    return { session }
  },
  loader: async ({ context }) => {
    if (!context.session) return { prereqsSummary: null }
    return { prereqsSummary: await getSystemPrereqs() }
  },
  errorComponent: RouteErrorPage,
  notFoundComponent: NotFoundPage,
  component: RootLayout,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider delayDuration={150}>
          <ErrorDialogProvider>{children}</ErrorDialogProvider>
        </TooltipProvider>
        <PortalRoot />
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const { session } = Route.useRouteContext()
  const { prereqsSummary } = Route.useLoaderData()
  const router = useRouter()
  const matches = useMatches()

  const publicPaths = new Set([
    '/home',
    '/login',
    '/accept-invite',
    '/forgot-password',
    '/reset-password',
    '/verify-email-sent',
    '/upload-photo/$token',
  ])
  const isPublicPage = matches.some((m) => publicPaths.has(m.fullPath))
  const isNotFoundPage = matches.some((match) => match.status === 'notFound')
  const needsRedirect = !session && !isPublicPage && !isNotFoundPage

  const location = useLocation()
  const userRoleForRedirect =
    (session?.user as { role?: string } | undefined)?.role ?? ''
  const isOnPosPath =
    location.pathname === '/pos' || location.pathname.startsWith('/pos/')
  const needsPosRedirect =
    !!session &&
    userRoleForRedirect === 'sales' &&
    !isPublicPage &&
    !isNotFoundPage &&
    !isOnPosPath

  // All useEffect hooks must be called unconditionally before any early returns
  useEffect(() => {
    if (needsRedirect) {
      void router.navigate({ to: '/login' })
    }
  }, [needsRedirect, router])

  useEffect(() => {
    if (needsPosRedirect) void router.navigate({ to: '/pos' })
  }, [needsPosRedirect, router])

  if (needsRedirect) {
    return null
  }

  if (needsPosRedirect) return null

  if (isPublicPage) {
    return <Outlet />
  }

  const userName =
    (session?.user as { name?: string } | undefined)?.name ?? 'User'
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? ''
  const pendingHardCount = prereqsSummary?.failingHard ?? 0

  async function handleLogout() {
    await authClient.signOut()
    await router.navigate({ to: '/login' })
  }

  const onLogout = () => {
    void handleLogout()
  }

  return (
    <SidebarProvider className="h-svh min-h-0 overflow-hidden">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:z-50"
      >
        Skip to content
      </a>
      <AppSidebar
        userName={userName}
        userRole={userRole}
        userEmail={session?.user.email}
        userImage={session?.user.image}
        onLogout={onLogout}
        pendingHardCount={pendingHardCount}
      />
      <SidebarInset className="min-w-0 overflow-hidden">
        <AppHeader userRole={userRole} />
        <div className="flex-1 overflow-y-auto" id="main-content" tabIndex={-1}>
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-6 lg:py-8">
            <Outlet />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
