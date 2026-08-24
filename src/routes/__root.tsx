import { useEffect } from 'react'
import {
  HeadContent,
  Link,
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
import { AppSidebar, SidebarTrigger } from '#/components/app-sidebar'
import { Logo } from '#/components/logo'
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
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/logo.svg' },
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
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        userName={userName}
        userRole={userRole}
        onLogout={onLogout}
        pendingHardCount={pendingHardCount}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center gap-3 border-b border-border/60 bg-sidebar px-4 md:hidden">
          <SidebarTrigger
            userName={userName}
            userRole={userRole}
            onLogout={onLogout}
            pendingHardCount={pendingHardCount}
          />
          <Link
            to="/"
            aria-label="Go to dashboard"
            className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <Logo className="size-7" />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              Inventory
            </span>
          </Link>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-[1120px] px-8 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
