import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  useMatches,
} from "@tanstack/react-router"

import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { getSession } from "#/server/middleware/auth"
import { authClient } from "#/lib/auth-client"
import appCss from "../styles.css?url"

import type { QueryClient } from "@tanstack/react-query"

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Inventory Management" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  beforeLoad: async () => {
    const session = await getSession()
    return { session }
  },
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
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const { session } = Route.useRouteContext()
  const router = useRouter()
  const matches = useMatches()

  // Check if current route is the login page
  const isLoginPage = matches.some((m) => m.fullPath === "/login")

  // If not logged in and not on login page, redirect to login
  if (!session && !isLoginPage) {
    router.navigate({ to: "/login" })
    return null
  }

  // Login page renders without the nav shell
  if (isLoginPage) {
    return <Outlet />
  }

  const userName = (session?.user as { name?: string })?.name ?? "User"
  const userRole = (session?.user as { role?: string })?.role ?? ""

  async function handleLogout() {
    await authClient.signOut()
    router.navigate({ to: "/login" })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="flex h-14 items-center px-6 gap-6">
          <Link to="/" className="font-bold text-lg">
            Inventory
          </Link>
          <nav className="flex gap-4 text-sm flex-1">
            <Link
              to="/supply"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Routes
            </Link>
            <Link
              to="/supply/suppliers"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Suppliers
            </Link>
            <Separator orientation="vertical" className="h-4 self-center" />
            <Link
              to="/store"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Stock
            </Link>
            <Link
              to="/store/receiving"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Receiving
            </Link>
            <Link
              to="/store/transfers"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Transfers
            </Link>
            <Separator orientation="vertical" className="h-4 self-center" />
            <Link
              to="/shop"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Shop
            </Link>
            <Link
              to="/shop/sales"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Sales
            </Link>
            <Separator orientation="vertical" className="h-4 self-center" />
            <Link
              to="/reports"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Reports
            </Link>
            <Link
              to="/reports/ledger"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Ledger
            </Link>
            <Separator orientation="vertical" className="h-4 self-center" />
            <Link
              to="/settings"
              className="text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium"
            >
              Settings
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {userName}
              {userRole && (
                <span className="ml-1 text-xs">({userRole})</span>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
