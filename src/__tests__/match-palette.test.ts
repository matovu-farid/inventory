import { describe, it, expect } from 'vitest'
import { matchPaletteHex } from '#/lib/colors/match-palette'

describe('matchPaletteHex', () => {
  it('exact match returns same tile', () => {
    expect(matchPaletteHex('#0a0a0a').name).toBe('Black')
  })
  it('near-burgundy returns Burgundy', () => {
    expect(matchPaletteHex('#7c2030').name).toBe('Burgundy')
  })
  it('dark navy hex maps to Navy', () => {
    expect(matchPaletteHex('#0a1d40').name).toBe('Navy')
  })
  it('pure red hex maps to Red', () => {
    expect(matchPaletteHex('#cc2828').name).toBe('Red')
  })
  it('forest green hex maps to Forest', () => {
    expect(matchPaletteHex('#1e4f30').name).toBe('Forest')
  })
})
