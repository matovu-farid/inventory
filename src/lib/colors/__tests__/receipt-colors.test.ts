import { describe, expect, it } from 'vitest'
import {
  colorHexToName,
  colorNameToHex,
  getActiveColorQuery,
  isReceiptColorHexList,
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

  it('maps palette names back to their hex values', () => {
    expect(colorNameToHex('  Charcoal ')).toBe('#36454f')
  })

  it('validates comma-separated receipt hex values', () => {
    expect(isReceiptColorHexList('#f5e9d0, #36454f')).toBe(true)
    expect(isReceiptColorHexList('#f5e9d0,')).toBe(false)
  })
})
