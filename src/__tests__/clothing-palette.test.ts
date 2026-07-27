import { describe, it, expect } from 'vitest'
import { CLOTHING_PALETTE } from '#/lib/colors/palette'

describe('CLOTHING_PALETTE', () => {
  it('has at least 25 colors', () => {
    expect(CLOTHING_PALETTE.length).toBeGreaterThanOrEqual(25)
  })
  it('every entry has a non-empty name and valid #rrggbb hex', () => {
    for (const c of CLOTHING_PALETTE) {
      expect(c.name).toMatch(/\S/)
      expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
  it('color names are unique', () => {
    const names = new Set(CLOTHING_PALETTE.map((c) => c.name))
    expect(names.size).toBe(CLOTHING_PALETTE.length)
  })
  it('hex values are unique', () => {
    const hexes = new Set(CLOTHING_PALETTE.map((c) => c.hex.toLowerCase()))
    expect(hexes.size).toBe(CLOTHING_PALETTE.length)
  })
  it('includes common clothing colors', () => {
    const names = CLOTHING_PALETTE.map((c) => c.name.toLowerCase())
    for (const expected of [
      'black',
      'white',
      'navy',
      'red',
      'burgundy',
      'khaki',
      'gray',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
