import { describe, expect, it } from 'vitest'
import {
  colorHexToName,
  getActiveColorQuery,
  normalizeColorHex,
  replaceActiveColor,
} from '../receipt-colors'

describe('receipt colour helpers', () => {
  it('uses the text after the last comma as the active query', () => {
    expect(getActiveColorQuery('Black, Navy, bl')).toBe('bl')
  })

  it('replaces only the active comma-separated segment', () => {
    expect(replaceActiveColor('Black, bl', 'Blue')).toBe('Black, Blue')
    expect(replaceActiveColor('bl', 'Blue')).toBe('Blue')
  })

  it('maps a hex colour to the nearest clothing colour name', () => {
    expect(colorHexToName('#000000')).toBe('Black')
    expect(colorHexToName('000000')).toBe('Black')
  })

  it('normalizes picker values before persistence', () => {
    expect(normalizeColorHex('ff0000')).toBe('#ff0000')
  })
})
