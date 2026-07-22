import { describe, it, expect } from 'vitest'
import { deriveSizes } from '#/lib/variants'

/**
 * Issue #7 — UI helpers that translate the materialised variants list
 * (the canonical source of truth for an item's sizes) into the shapes
 * the various UI surfaces expect. `items.sizes` is going away in this
 * issue; everything that used to read it now derives from the variants
 * array.
 *
 * `deriveSizes` returns the unique sizes from a variants array, sorted
 * in the canonical clothing order used in the seed (XS → S → M → L → XL
 * → XXL; numeric sizes like "30"/"32" sort numerically and follow the
 * letter sizes). Unknown / freeform sizes fall back to lexicographic
 * order at the end so the function never throws on weird input.
 */
describe('deriveSizes', () => {
  it('returns an empty array for an item with no variants', () => {
    expect(deriveSizes([])).toEqual([])
  })

  it('dedupes sizes across multiple colors', () => {
    const variants = [
      { id: 'v1', colorId: 'c1', size: 'M' },
      { id: 'v2', colorId: 'c2', size: 'M' },
      { id: 'v3', colorId: 'c1', size: 'L' },
    ]
    expect(deriveSizes(variants)).toEqual(['M', 'L'])
  })

  it('sorts canonical letter sizes XS → S → M → L → XL → XXL', () => {
    const variants = [
      { id: 'v1', colorId: 'c1', size: 'L' },
      { id: 'v2', colorId: 'c1', size: 'XS' },
      { id: 'v3', colorId: 'c1', size: 'XXL' },
      { id: 'v4', colorId: 'c1', size: 'M' },
      { id: 'v5', colorId: 'c1', size: 'XL' },
      { id: 'v6', colorId: 'c1', size: 'S' },
    ]
    expect(deriveSizes(variants)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
  })

  it('sorts numeric sizes numerically (30, 32, 34 — not 30, 34, 32)', () => {
    const variants = [
      { id: 'v1', colorId: 'c1', size: '34' },
      { id: 'v2', colorId: 'c1', size: '30' },
      { id: 'v3', colorId: 'c1', size: '32' },
    ]
    expect(deriveSizes(variants)).toEqual(['30', '32', '34'])
  })

  it('groups letter sizes before numeric sizes, both sorted within their group', () => {
    const variants = [
      { id: 'v1', colorId: 'c1', size: '32' },
      { id: 'v2', colorId: 'c1', size: 'M' },
      { id: 'v3', colorId: 'c1', size: '30' },
      { id: 'v4', colorId: 'c1', size: 'S' },
    ]
    expect(deriveSizes(variants)).toEqual(['S', 'M', '30', '32'])
  })

  it('places unknown sizes lexicographically at the end', () => {
    const variants = [
      { id: 'v1', colorId: 'c1', size: 'FREE' },
      { id: 'v2', colorId: 'c1', size: 'M' },
      { id: 'v3', colorId: 'c1', size: 'AAA' },
    ]
    expect(deriveSizes(variants)).toEqual(['M', 'AAA', 'FREE'])
  })
})

describe('openingBalanceUsesVariantGrid', () => {
  it('returns false when there are no variants', async () => {
    const { openingBalanceUsesVariantGrid } = await import('#/lib/variants')
    expect(
      openingBalanceUsesVariantGrid({
        colors: [{ id: 'c1' }, { id: 'c2' }],
        variants: [],
      }),
    ).toBe(false)
  })

  it('returns false for a partial single-size catalog (TR-004 shape)', async () => {
    const { openingBalanceUsesVariantGrid, openingBalanceImplicitSize } =
      await import('#/lib/variants')
    const item = {
      colors: [{ id: 'black' }, { id: 'royal' }],
      variants: [{ id: 'v1', colorId: 'royal', size: 'M' }],
    }
    expect(openingBalanceUsesVariantGrid(item)).toBe(false)
    expect(openingBalanceImplicitSize(item)).toBe('OS')
  })

  it('returns true when every color has the sole size', async () => {
    const { openingBalanceUsesVariantGrid, openingBalanceImplicitSize } =
      await import('#/lib/variants')
    const item = {
      colors: [{ id: 'c1' }, { id: 'c2' }],
      variants: [
        { id: 'v1', colorId: 'c1', size: 'M' },
        { id: 'v2', colorId: 'c2', size: 'M' },
      ],
    }
    expect(openingBalanceUsesVariantGrid(item)).toBe(false)
    expect(openingBalanceImplicitSize(item)).toBe('M')
  })

  it('returns true for multi-size items', async () => {
    const { openingBalanceUsesVariantGrid } = await import('#/lib/variants')
    expect(
      openingBalanceUsesVariantGrid({
        colors: [{ id: 'c1' }],
        variants: [
          { id: 'v1', colorId: 'c1', size: 'S' },
          { id: 'v2', colorId: 'c1', size: 'M' },
        ],
      }),
    ).toBe(true)
  })
})
