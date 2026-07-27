import { describe, it, expect } from 'vitest'
import { isSameDayKampala, formatDayKampala } from '#/lib/business-date'

describe('isSameDayKampala', () => {
  it('treats midnight UTC and next-morning UTC as the same Kampala day if both fall on it', () => {
    const a = new Date('2026-05-22T00:00:00Z')
    const b = new Date('2026-05-22T17:59:00Z')
    expect(isSameDayKampala(a, b)).toBe(true)
  })

  it('flags midnight-UTC boundary correctly when one falls in previous Kampala day', () => {
    const earlyKampala = new Date('2026-05-21T23:30:00Z')
    const noonKampala = new Date('2026-05-22T11:00:00Z')
    expect(isSameDayKampala(earlyKampala, noonKampala)).toBe(true)
  })

  it('returns false for different Kampala days', () => {
    const may22 = new Date('2026-05-22T11:00:00Z')
    const may21 = new Date('2026-05-21T11:00:00Z')
    expect(isSameDayKampala(may22, may21)).toBe(false)
  })
})

describe('formatDayKampala', () => {
  it('renders YYYY-MM-DD in Africa/Kampala', () => {
    expect(formatDayKampala(new Date('2026-05-22T11:00:00Z'))).toBe(
      '2026-05-22',
    )
  })
})
