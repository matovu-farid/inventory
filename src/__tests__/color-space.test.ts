import { describe, it, expect } from 'vitest'
import {
  hexToRgb,
  rgbToHex,
  rgbToLab,
  labToRgb,
  deltaE76,
} from '#/lib/colors/lab'

describe('hex/rgb/lab conversions', () => {
  it('hexToRgb parses #rrggbb', () => {
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexToRgb('#7b1f2b')).toEqual({ r: 123, g: 31, b: 43 })
  })
  it('rgbToHex round-trips', () => {
    expect(rgbToHex({ r: 123, g: 31, b: 43 })).toBe('#7b1f2b')
  })
  it('rgbToLab → labToRgb round-trip is within 2 units', () => {
    const rgb = { r: 200, g: 100, b: 50 }
    const lab = rgbToLab(rgb)
    const back = labToRgb(lab)
    expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(2)
    expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(2)
  })
})

describe('deltaE76', () => {
  it('returns 0 for identical Lab', () => {
    const a = rgbToLab({ r: 100, g: 100, b: 100 })
    expect(deltaE76(a, a)).toBeCloseTo(0, 6)
  })
  it('returns small distance for near-identical colors', () => {
    const a = rgbToLab({ r: 200, g: 50, b: 50 })
    const b = rgbToLab({ r: 205, g: 55, b: 55 })
    expect(deltaE76(a, b)).toBeLessThan(5)
  })
  it('returns large distance between opposite colors', () => {
    const a = rgbToLab({ r: 0, g: 0, b: 0 })
    const b = rgbToLab({ r: 255, g: 255, b: 255 })
    expect(deltaE76(a, b)).toBeGreaterThan(80)
  })
})
