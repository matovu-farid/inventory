import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import * as Sentry from '@sentry/tanstackstart-react'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'
import { NotFoundPage, RouteErrorPage } from '#/components/error-pages'
import { createRouteErrorReporter } from '#/lib/error-handling'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    defaultErrorComponent: RouteErrorPage,
    defaultNotFoundComponent: NotFoundPage,
    defaultOnCatch: createRouteErrorReporter((error, errorInfo) => {
      Sentry.withScope((scope) => {
        scope.setContext('react', {
          componentStack: errorInfo.componentStack,
        })
        Sentry.captureException(error)
      })
    }),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
