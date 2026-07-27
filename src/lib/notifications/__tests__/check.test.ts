import { describe, it, expect } from 'vitest'
import { isBelowThreshold } from '#/lib/notifications/check'

describe('isBelowThreshold — units mode', () => {
  it('returns below when qoh <= rule.value', () => {
    expect(isBelowThreshold(5, 100, { mode: 'units', value: 5 })).toEqual({
      below: true,
      reason: 'below',
    })
    expect(isBelowThreshold(3, 100, { mode: 'units', value: 5 })).toEqual({
      below: true,
      reason: 'below',
    })
  })

  it('returns above when qoh > rule.value', () => {
    expect(isBelowThreshold(6, 100, { mode: 'units', value: 5 })).toEqual({
      below: false,
      reason: 'above',
    })
  })

  it('ignores baseline when in units mode (including null)', () => {
    expect(isBelowThreshold(2, null, { mode: 'units', value: 5 })).toEqual({
      below: true,
      reason: 'below',
    })
  })
})

describe('isBelowThreshold — percent mode', () => {
  it('returns below when qoh / baseline <= rule.value/100', () => {
    expect(isBelowThreshold(15, 100, { mode: 'percent', value: 15 })).toEqual({
      below: true,
      reason: 'below',
    })
    expect(isBelowThreshold(10, 100, { mode: 'percent', value: 15 })).toEqual({
      below: true,
      reason: 'below',
    })
  })

  it('returns above when ratio exceeds rule', () => {
    expect(isBelowThreshold(20, 100, { mode: 'percent', value: 15 })).toEqual({
      below: false,
      reason: 'above',
    })
  })

  it('skips when baseline is null (no history)', () => {
    expect(isBelowThreshold(5, null, { mode: 'percent', value: 15 })).toEqual({
      below: false,
      reason: 'no_baseline_for_percent',
    })
  })

  it('skips when baseline is zero', () => {
    expect(isBelowThreshold(5, 0, { mode: 'percent', value: 15 })).toEqual({
      below: false,
      reason: 'zero_baseline',
    })
  })

  it('treats negative qoh as zero', () => {
    expect(isBelowThreshold(-3, 100, { mode: 'percent', value: 15 })).toEqual({
      below: true,
      reason: 'below',
    })
  })
})
