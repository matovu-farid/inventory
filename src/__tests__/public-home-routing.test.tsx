// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { Route as HomeRoute } from '#/routes/home'
import { REMEMBERED_LOGIN_COOKIE } from '#/lib/auth/remembered-login'

vi.mock('#/components/request-access-dialog', () => ({
  RequestAccessDialog: ({ trigger }: { trigger: ReactElement }) => trigger,
}))

vi.mock('#/components/dashboard/workspace-preview', () => ({
  WorkspacePreview: () => <div>Sample workspace</div>,
}))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.cookie = `${REMEMBERED_LOGIN_COOKIE}=; Max-Age=0; Path=/`
})

describe('direct /home visits', () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'stays on the public page for session=%s remembered=%s',
    async (hasSession, remembered) => {
      if (remembered) {
        document.cookie = `${REMEMBERED_LOGIN_COOKIE}=1; Path=/`
      }

      const rootRoute = createRootRoute({
        beforeLoad: () => ({
          session: hasSession ? { user: { role: 'admin' } } : null,
        }),
      })
      // Register the file route with the test root as the generated tree does.
      const homeRoute = HomeRoute.update({
        id: '/home',
        path: '/home',
        getParentRoute: () => rootRoute,
      } as Parameters<typeof HomeRoute.update>[0])
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <div>Dashboard</div>,
      })
      const loginRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/login',
        component: () => <div>Login</div>,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([homeRoute, indexRoute, loginRoute]),
        history: createMemoryHistory({ initialEntries: ['/home'] }),
      })

      await router.load()
      render(<RouterProvider router={router} />)

      expect(
        await screen.findByRole('heading', {
          name: 'Run the floor with clarity.',
        }),
      ).toBeTruthy()
      expect(router.state.location.pathname).toBe('/home')
    },
  )
})
