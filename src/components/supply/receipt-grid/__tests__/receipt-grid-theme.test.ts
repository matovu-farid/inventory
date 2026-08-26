import { describe, expect, it } from 'vitest'
import { createReceiptGridTheme } from '../receipt-grid-theme'

describe('createReceiptGridTheme', () => {
  it('converts app OKLCH colors to canvas-safe RGB colors', () => {
    const theme = createReceiptGridTheme((name) => {
      const values: Record<string, string> = {
        '--foreground': 'oklch(0.145 0.005 285.82)',
        '--muted-foreground': 'oklch(0.45 0.01 285.82)',
        '--background': 'oklch(1 0 0)',
        '--muted': 'oklch(0.96 0.005 285.82)',
        '--border': 'oklch(0.9 0.005 285.82)',
        '--primary': 'oklch(0.55 0.2 260)',
      }
      return values[name] ?? ''
    })

    expect(theme.textDark).toMatch(/^rgb\(/)
    expect(theme.textMedium).toMatch(/^rgb\(/)
    expect(theme.textLight).toMatch(/^rgb\(/)
    expect(theme.bgCell).toBe('rgb(255, 255, 255)')
    expect(theme.bgHeader).toMatch(/^rgb\(/)
    expect(theme.accentLight).toBe('rgba(37, 99, 235, 0.14)')
  })

  it('provides readable fallbacks when CSS variables are unavailable', () => {
    const theme = createReceiptGridTheme(() => '')

    expect(theme.textDark).toBe('#111113')
    expect(theme.textMedium).toBe('#52525b')
    expect(theme.textLight).toBe('#71717a')
  })
})
