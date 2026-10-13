import {
  createFileRoute,
  redirect,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Dashboard } from '#/components/dashboard/dashboard'
import { DashboardSkeleton } from '#/components/dashboard/dashboard-skeleton'
import { WorkspaceLinks } from '#/components/dashboard/workspace-links'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import { getDashboardOverview } from '#/server/functions/dashboard/overview'
import { getSystemPrereqs } from '#/server/functions/prereqs/system'
import {
  getRootRedirect,
  hasRememberedLogin,
} from '#/lib/auth/remembered-login'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    const redirectTo = getRootRedirect({
      hasSession: Boolean(context.session),
      hasRememberedLogin: hasRememberedLogin(),
    })
    if (redirectTo) throw redirect({ to: redirectTo })
    const role = (context.session?.user as { role?: string } | undefined)?.role
    if (role === 'sales') throw redirect({ to: '/shop' })
  },
  loader: async () => {
    const [overview, summary] = await Promise.allSettled([
      getDashboardOverview(),
      getSystemPrereqs(),
    ])
    return {
      overview: overview.status === 'fulfilled' ? overview.value : null,
      summary: summary.status === 'fulfilled' ? summary.value : null,
    }
  },
  pendingComponent: DashboardSkeleton,
  component: Home,
})

function Home() {
  const { overview, summary } = Route.useLoaderData()
  const { session } = useRouteContext({ from: '__root__' })
  const router = useRouter()
  const role = (session?.user as { role?: string } | undefined)?.role

  if (!overview || !summary) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your inventory management overview.
          </p>
        </div>
        <Alert>
          <AlertTriangle />
          <AlertTitle>Dashboard data is unavailable</AlertTitle>
          <AlertDescription>
            <p>
              Your workspace is still accessible. Retry to load the latest stock
              and sales.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void router.invalidate()}
            >
              <RefreshCw data-icon="inline-start" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
        <WorkspaceLinks role={role} />
      </div>
    )
  }

  return (
    <Dashboard
      overview={overview}
      summary={summary}
      role={role}
      userName={session?.user.name ?? 'User'}
    />
  )
}
