import { describe, expect, it } from 'vitest'
import { normalizeArticleNumber } from '#/lib/items/article-number'

describe('normalizeArticleNumber', () => {
  it('trims whitespace and normalizes case', () => {
    expect(normalizeArticleNumber('  ts-01 ')).toBe('TS-01')
  })

  it('rejects a blank value', () => {
    expect(() => normalizeArticleNumber('  ')).toThrow(
      'Article number is required',
    )
  })
})
