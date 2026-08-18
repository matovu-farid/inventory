import { describe, expect, it } from 'vitest'
import { suggestArticleNumber } from '#/lib/article-number'

describe('suggestArticleNumber', () => {
  it('combines category and item name into an editable readable code', () => {
    expect(
      suggestArticleNumber({
        design: 'Women’s tops',
        name: 'Crew neck T-shirt',
      }),
    ).toBe('WOMEN-S-CREW-NECK-T-SHIRT')
  })

  it('handles missing context without producing punctuation-only codes', () => {
    expect(suggestArticleNumber({ design: '', name: 'Blue jeans' })).toBe(
      'BLUE-JEANS',
    )
    expect(suggestArticleNumber({ design: 'Shoes', name: '' })).toBe('SHOES')
    expect(suggestArticleNumber({ design: '', name: '' })).toBe('')
  })

  it('adds the first available numeric suffix for a collision', () => {
    expect(
      suggestArticleNumber({
        design: 'Shoes',
        name: 'Canvas',
        existingArticleNumbers: new Set(['SHOES-CANVAS', 'SHOES-CANVAS-2']),
      }),
    ).toBe('SHOES-CANVAS-3')
  })
})
