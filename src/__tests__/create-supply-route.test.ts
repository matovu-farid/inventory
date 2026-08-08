import { describe, it, expect, vi, afterAll } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { eq } from 'drizzle-orm'

import { db } from '#/db'
import { supplyRoutes } from '#/db/schema'
import { createSupplyRoute } from '#/server/functions/supply/routes'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000sr'
vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: 'admin' },
    }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
  requireSessionAndRole: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: 'admin' },
    }),
}))

const stubStartContext = {
  getRouter: (() => {
    throw new Error('router not available in tests')
  }) as never,
  request: new Request('http://localhost/test'),
  startOptions: { functionMiddleware: [] },
  contextAfterGlobalMiddlewares: {},
  executedRequestMiddlewares: new Set(),
  handlerType: 'serverFn' as const,
}

function callServerFn<T>(fn: () => Promise<T>): Promise<T> {
  return runWithStartContext(stubStartContext, fn)
}

const createdIds: string[] = []

afterAll(async () => {
  if (createdIds.length > 0) {
    const id = createdIds[0]
    if (id) await db.delete(supplyRoutes).where(eq(supplyRoutes.id, id))
  }
})

describe('createSupplyRoute', () => {
  it('creates a minimal open route', async () => {
    const name = `Vitest Route ${Date.now()}`
    await callServerFn(() =>
      createSupplyRoute({
        data: { name },
      }),
    )
    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.name, name),
    })
    expect(route).toBeDefined()
    if (route) createdIds.push(route.id)
    expect(route?.status).toBe('open')
  })

  it('creates a route with optional budget and rates', async () => {
    const name = `Vitest Route Full ${Date.now()}`
    await callServerFn(() =>
      createSupplyRoute({
        data: {
          name,
          departureDate: '2026-05-01',
          returnDate: '2026-05-15',
          budgetUsd: '5000',
          rateUgxPerUsd: '3750',
          rateRmbPerUsd: '7.25',
          notes: 'Test notes',
        },
      }),
    )
    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.name, name),
    })
    expect(route).toBeDefined()
    if (route) createdIds.push(route.id)
    expect(route?.budgetUsd).toBe('5000.00')
    expect(route?.rateUgxPerUsd).toBe('3750.00')
  })

  it('rejects return date before departure date', async () => {
    const name = `Bad Dates ${Date.now()}`
    await expect(
      callServerFn(() =>
        createSupplyRoute({
          data: {
            name,
            departureDate: '2026-05-15',
            returnDate: '2026-05-01',
          },
        }),
      ),
    ).rejects.toThrow('Return date')
  })
})
