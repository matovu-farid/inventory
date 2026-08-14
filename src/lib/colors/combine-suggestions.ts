export interface ColorSuggestion {
  name: string
  hex: string
  sampledHex: string
}

export function combineColorSuggestions(
  suggestions: ReadonlyArray<ColorSuggestion>,
): ColorSuggestion | null {
  if (suggestions.length === 0) return null

  const counts = new Map<
    string,
    { count: number; first: number; value: ColorSuggestion }
  >()

  suggestions.forEach((value, first) => {
    const key = `${value.name}\u0000${value.hex.toLowerCase()}`
    const current = counts.get(key)
    counts.set(
      key,
      current
        ? { ...current, count: current.count + 1 }
        : { count: 1, first, value },
    )
  })

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.first - b.first,
  )[0].value
}
