import { describe, expect, it } from 'vitest'
import { combineColorSuggestions } from '#/lib/colors/combine-suggestions'

describe('combineColorSuggestions', () => {
  it('chooses the most frequent palette suggestion', () => {
    expect(
      combineColorSuggestions([
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' },
        { name: 'Red', hex: '#cc2828', sampledHex: '#aa2222' },
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#102040' },
      ]),
    ).toEqual({ name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' })
  })

  it('keeps first-seen order for a tie', () => {
    const suggestion = combineColorSuggestions([
      { name: 'Red', hex: '#cc2828', sampledHex: '#aa2222' },
      { name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' },
    ])
    expect(suggestion?.name).toBe('Red')
  })

  it('returns null when no images produced a suggestion', () => {
    expect(combineColorSuggestions([])).toBeNull()
  })
})
