import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  createSupplyRoute,
  listSupplyRoutes,
} from '#/server/functions/supply/routes'
import { requireUiPermission } from '#/lib/permissions'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'

export const Route = createFileRoute('/supply/new')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: () => listSupplyRoutes(),
  component: NewSupplyRouteEntry,
})

function NewSupplyRouteEntry() {
  const routes = Route.useLoaderData().filter(
    (route) => route.status === 'open',
  )
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const recent = routes.at(0)

  async function startNewRoute() {
    if (!name.trim()) {
      setError('Enter a route name')
      return
    }
    setCreating(true)
    setError('')
    try {
      const route = await createSupplyRoute({ data: { name: name.trim() } })
      await router.navigate({
        to: '/supply/wizard/$routeId',
        params: { routeId: route.id },
      })
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not create route',
      )
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Supply route entry</p>
        <h1 className="text-2xl font-bold">Where do you want to start?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Continue a route you are still entering, or start a new buying trip.
        </p>
      </div>

      {recent && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">
              Continue most recent route
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{recent.name}</p>
              <p className="text-sm text-muted-foreground">
                {recent.items.length} item rows · still open
              </p>
            </div>
            <Link to="/supply/$routeId/entry" params={{ routeId: recent.id }}>
              <Button>Continue</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select another open route</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {routes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other open routes.
            </p>
          ) : (
            routes.map((route) => (
              <Link
                key={route.id}
                to="/supply/$routeId/entry"
                params={{ routeId: route.id }}
                className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
              >
                <span className="font-medium">{route.name}</span>
                <span className="text-muted-foreground">
                  {route.items.length} item rows
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start a new route</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            aria-label="New route name"
            placeholder="e.g. Guangzhou August 2026"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="button"
            onClick={() => void startNewRoute()}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Start new route'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
