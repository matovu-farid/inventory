import { describe, expect, it } from 'vitest'
import { getExistingSupplyRouteInitialStep } from '#/lib/supply-route-entry-step'

describe('existing supply route entry step', () => {
  it('opens the review step when continuing a route without a step selection', () => {
    expect(getExistingSupplyRouteInitialStep(undefined)).toBe('review')
  })

  it('preserves an explicitly selected step', () => {
    expect(getExistingSupplyRouteInitialStep('items')).toBe('items')
  })

  it('maps the removed suppliers step to items', () => {
    expect(getExistingSupplyRouteInitialStep('suppliers')).toBe('items')
  })
})
