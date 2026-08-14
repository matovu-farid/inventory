import { describe, expect, it } from 'vitest'
import { rankColorSuggestions } from '#/lib/colors/rank-suggestions'

describe('rankColorSuggestions', () => {
  it('deduplicates image suggestions and keeps the most frequent first', () => {
    expect(
      rankColorSuggestions([
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' },
        { name: 'Blue', hex: '#2244aa', sampledHex: '#3355bb' },
        { name: 'Navy', hex: '#0a1d40', sampledHex: '#112244' },
      ]),
    ).toEqual([
      {
        name: 'Navy',
        hex: '#0a1d40',
        sampledHex: '#112244',
        imageCount: 2,
      },
      {
        name: 'Blue',
        hex: '#2244aa',
        sampledHex: '#3355bb',
        imageCount: 1,
      },
    ])
  })
})
