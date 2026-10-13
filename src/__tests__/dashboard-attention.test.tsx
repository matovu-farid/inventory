import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { AttentionPanel } from '#/components/dashboard/attention-panel'
import type { DashboardOverview } from '#/lib/dashboard'

const overview: DashboardOverview = {
  asOfDate: '2026-10-13',
  salesSeries: [],
  summary: {
    warehouseUnits: 0,
    shopUnits: 0,
    catalogItems: 0,
    pendingTransfers: 0,
  },
  locations: [],
  recentSales: [],
  lowStockCount: 3,
  openSupplyRoutes: null,
  lowStockLocations: [
    { scope: 'store', locationId: 'store-1', name: 'Main warehouse', count: 1 },
    { scope: 'shop', locationId: 'shop-1', name: 'Central shop', count: 2 },
  ],
}
const summary = {
  totalChecks: 4,
  passing: 4,
  failingHard: 0,
  failingSoft: 0,
  items: [],
  satisfiedPages: [],
}

async function renderPanel(role: string) {
  const route = createRootRoute({
    component: () => (
      <AttentionPanel overview={overview} summary={summary} role={role} />
    ),
  })
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return renderToStaticMarkup(<RouterProvider router={router} />)
}

describe('dashboard attention actions', () => {
  it('links low-stock locations to replenishment workflows', async () => {
    const html = await renderPanel('admin')
    expect(html).toContain('href="/store/restock-requisitions"')
    expect(html).toContain('href="/shop/shop-1/restock"')
    expect(html).not.toContain('href="/settings/notifications"')
  })

  it('omits warehouse replenishment actions for a supervisor', async () => {
    const html = await renderPanel('supervisor')
    expect(html).toContain('Central shop')
    expect(html).toContain('href="/shop/shop-1/restock"')
    expect(html).not.toContain('Main warehouse')
    expect(html).not.toContain('/store/restock-requisitions')
  })
})
