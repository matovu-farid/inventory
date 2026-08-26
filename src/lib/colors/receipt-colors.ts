import { CLOTHING_PALETTE } from './palette'
import { matchPaletteHex } from './match-palette'

export interface ReceiptColorOption {
  id?: string
  name: string
  hex: string
}

export function splitColorSegments(value: string): string[] {
  return value.split(',').map((segment) => segment.trim())
}

export function getActiveColorIndex(value: string): number {
  return Math.max(0, splitColorSegments(value).length - 1)
}

export function getActiveColorQuery(value: string): string {
  const comma = value.lastIndexOf(',')
  return value.slice(comma + 1).trim()
}

export function replaceActiveColor(value: string, replacement: string): string {
  const comma = value.lastIndexOf(',')
  if (comma < 0) return replacement
  return `${value.slice(0, comma + 1).trimEnd()} ${replacement}`
}

export function colorHexToName(hex: string): string {
  const normalized = normalizeColorHex(hex)
  return normalized ? matchPaletteHex(normalized).name : ''
}

export function colorNameToHex(name: string): string {
  const normalized = name.trim().toLocaleLowerCase()
  return (
    CLOTHING_PALETTE.find(
      (color) => color.name.toLocaleLowerCase() === normalized,
    )?.hex ?? ''
  )
}

export function isReceiptColorHexList(value: string): boolean {
  const hexes = value.split(',').map((hex) => hex.trim())
  return hexes.length > 0 && hexes.every((hex) => /^#[0-9a-fA-F]{6}$/.test(hex))
}

export function normalizeColorHex(hex: string): string {
  const normalized = hex.startsWith('#') ? hex : `#${hex}`
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : ''
}

export function paletteReceiptColorOptions(): ReceiptColorOption[] {
  return CLOTHING_PALETTE.map((color) => ({ name: color.name, hex: color.hex }))
}
