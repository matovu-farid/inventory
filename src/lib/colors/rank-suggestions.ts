import type { ColorSuggestion } from './combine-suggestions'

export interface RankedColorSuggestion extends ColorSuggestion {
  imageCount: number
}

export function rankColorSuggestions(
  suggestions: ReadonlyArray<ColorSuggestion>,
): RankedColorSuggestion[] {
  const counts = new Map<string, RankedColorSuggestion>()
  for (const suggestion of suggestions) {
    const key = `${suggestion.name.trim().toLowerCase()}\u0000${suggestion.hex.toLowerCase()}`
    const existing = counts.get(key)
    if (existing) {
      existing.imageCount += 1
    } else {
      counts.set(key, { ...suggestion, imageCount: 1 })
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.imageCount - a.imageCount || a.name.localeCompare(b.name),
  )
}
