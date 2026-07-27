import { describe, it, expect } from 'vitest'
import { severityForAlert, severityRank } from '#/lib/notifications/severity'

describe('severityForAlert', () => {
  it('percent rule, qoh <= 25% of baseline → critical', () => {
    expect(
      severityForAlert({
        rule: { mode: 'percent', value: 30 },
        baseline: 100,
        quantityOnHand: 25,
      }),
    ).toBe('critical')
  })

  it('percent rule, qoh between 25% and threshold → warning', () => {
    expect(
      severityForAlert({
        rule: { mode: 'percent', value: 30 },
        baseline: 100,
        quantityOnHand: 28,
      }),
    ).toBe('warning')
  })

  it('units rule with qoh=0 → critical', () => {
    expect(
      severityForAlert({
        rule: { mode: 'units', value: 5 },
        baseline: 100,
        quantityOnHand: 0,
      }),
    ).toBe('critical')
  })

  it('units rule with qoh>0 → warning', () => {
    expect(
      severityForAlert({
        rule: { mode: 'units', value: 5 },
        baseline: 100,
        quantityOnHand: 3,
      }),
    ).toBe('warning')
  })
})

describe('severityRank', () => {
  it('higher rank = more severe', () => {
    const critical = severityRank({
      rule: { mode: 'percent', value: 30 },
      baseline: 100,
      quantityOnHand: 5,
    })
    const less = severityRank({
      rule: { mode: 'percent', value: 30 },
      baseline: 100,
      quantityOnHand: 25,
    })
    expect(critical).toBeGreaterThan(less)
  })

  it('units rule with qoh=0 returns rank 1.0', () => {
    expect(
      severityRank({
        rule: { mode: 'units', value: 5 },
        baseline: 100,
        quantityOnHand: 0,
      }),
    ).toBe(1)
  })
})
