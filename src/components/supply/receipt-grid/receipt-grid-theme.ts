import type { Theme } from '@glideapps/glide-data-grid'

type CssVariableReader = (name: string) => string

const FALLBACKS = {
  foreground: '#111113',
  mutedForeground: '#52525b',
  background: '#ffffff',
  muted: '#f4f4f5',
  border: '#e4e4e7',
  primary: '#2563eb',
} as const

function color(
  read: CssVariableReader,
  name: string,
  fallback: string,
): string {
  const value = read(name).trim()
  if (!value) return fallback

  // Glide paints these values onto a canvas. Safari's canvas color parser does
  // not consistently accept CSS Color 4 `oklch(...)` strings, which can make
  // the canvas fall back to black for both the background and its text.
  return toCanvasColor(value) ?? fallback
}

function toCanvasColor(value: string): string | null {
  const match = value.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/i,
  )
  if (!match) return value

  const lightness = Number(match[1]) / (match[2] ? 100 : 1)
  const chroma = Number(match[3]) / (match[4] ? 100 : 1)
  const hue = (Number(match[5]) * Math.PI) / 180
  const alpha = match[6] ? Number(match[6]) / (match[7] ? 100 : 1) : 1

  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3)

  const linearRed = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const linearGreen = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const linearBlue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const toSrgb = (channel: number) => {
    const clamped = Math.min(1, Math.max(0, channel))
    const encoded =
      clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
    return Math.round(encoded * 255)
  }

  const channels = [toSrgb(linearRed), toSrgb(linearGreen), toSrgb(linearBlue)]
  return alpha === 1
    ? `rgb(${channels.join(', ')})`
    : `rgba(${channels.join(', ')}, ${Math.min(1, Math.max(0, alpha))})`
}

export function createReceiptGridTheme(
  read: CssVariableReader,
): Partial<Theme> {
  const foreground = color(read, '--foreground', FALLBACKS.foreground)
  const mutedForeground = color(
    read,
    '--muted-foreground',
    FALLBACKS.mutedForeground,
  )
  const lightText = color(read, '--muted-foreground', FALLBACKS.mutedForeground)
  const background = color(read, '--background', FALLBACKS.background)
  const muted = color(read, '--muted', FALLBACKS.muted)
  const border = color(read, '--border', FALLBACKS.border)
  const primary = color(read, '--primary', FALLBACKS.primary)

  return {
    accentColor: primary,
    accentFg: background,
    // This is used for selected and fill-highlighted cells. Keep it explicit
    // and canvas-safe so a CSS variable/parser fallback cannot turn the range
    // black while the user is copying values.
    accentLight: 'rgba(37, 99, 235, 0.14)',
    textDark: foreground,
    textMedium: mutedForeground,
    textLight: lightText === FALLBACKS.mutedForeground ? '#71717a' : lightText,
    textBubble: foreground,
    textHeader: foreground,
    textHeaderSelected: foreground,
    bgCell: background,
    bgCellMedium: muted,
    bgHeader: muted,
    bgHeaderHasFocus: muted,
    bgHeaderHovered: muted,
    bgBubble: background,
    bgBubbleSelected: muted,
    bgSearchResult: muted,
    borderColor: border,
    drilldownBorder: border,
    linkColor: primary,
  }
}

export function getReceiptGridTheme(): Partial<Theme> {
  return createReceiptGridTheme((name) => {
    if (typeof document === 'undefined') return ''
    return getComputedStyle(document.documentElement).getPropertyValue(name)
  })
}
