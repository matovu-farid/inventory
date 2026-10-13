import { describe, expect, it } from 'vitest'
import {
  getActiveNavPath,
  getAppBreadcrumbs,
  getNavigationGroups,
} from '#/lib/app-navigation'

describe('app navigation', () => {
  it('keeps item details and supply entry pages associated with their parent', () => {
    const groups = getNavigationGroups('admin')
    expect(getActiveNavPath('/items/ART-001', groups)).toBe('/items')
    expect(getActiveNavPath('/supply/route-1/entry', groups)).toBe('/supply')
  })

  it('selects the deepest visible link without marking a sibling or parent', () => {
    const groups = getNavigationGroups('admin')
    expect(getActiveNavPath('/reports/z/report-1', groups)).toBe('/reports/z')
    expect(getActiveNavPath('/settings/users/', groups)).toBe('/settings/users')
    expect(getActiveNavPath('/items-archived', groups)).toBeUndefined()
  })

  it('filters restricted navigation for supervisors and unknown roles', () => {
    const paths = getNavigationGroups('supervisor').flatMap((g) =>
      g.items.map((item) => item.to),
    )
    expect(paths).toContain('/store/transfers')
    expect(paths).toContain('/settings')
    expect(paths).not.toContain('/store')
    expect(paths).not.toContain('/settings/users')
    expect(paths).not.toContain('/supply')
    expect(getNavigationGroups('unknown')).toEqual([])
  })

  it('preserves the sales navigation destinations', () => {
    expect(
      getNavigationGroups('sales').flatMap((g) =>
        g.items.map((item) => item.to),
      ),
    ).toEqual(['/pos', '/shop/sales', '/shop'])
  })

  it('provides real route ancestors without showing internal identifiers', () => {
    expect(getAppBreadcrumbs('/supply/route-123/entry')).toEqual([
      { label: 'Supply routes', to: '/supply' },
      { label: 'Route details', to: '/supply/route-123' },
      { label: 'Stock entry', to: '/supply/route-123/entry' },
    ])
    expect(getAppBreadcrumbs('/settings/shops/shop-123/overrides')).toEqual([
      { label: 'Settings', to: '/settings' },
      { label: 'Shop overrides', to: '/settings/shops/shop-123/overrides' },
    ])
    expect(getAppBreadcrumbs('/')).toEqual([{ label: 'Dashboard', to: '/' }])
  })
})
