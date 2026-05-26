/**
 * Variant helpers — UI-side utilities that derive presentation shapes
 * from the materialized `variants` rows hydrated alongside an item.
 *
 * Sizes used to live on `items.sizes text[]`; issue #7 drops that column
 * and makes the set of (color, size) variant rows the source of truth.
 * Anything that used to read `items.sizes` now calls `deriveSizes(item.variants)`.
 */

export interface VariantLike {
  id: string
  colorId: string
  size: string
}

/**
 * Canonical clothing size order used in the seed data
 * (drizzle/0010_variants.sql backfills from items.sizes which carried
 * "S/M/L"-style labels). Anything not in this list is treated as a
 * numeric size (sorted numerically) or a freeform label (lexicographic).
 */
const LETTER_SIZE_ORDER = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
] as const

type LetterSize = (typeof LETTER_SIZE_ORDER)[number]

function isLetterSize(s: string): s is LetterSize {
  return (LETTER_SIZE_ORDER as readonly string[]).includes(s)
}

function isNumericSize(s: string): boolean {
  // Accept "30", "32.5" etc. — anything that parses as a non-NaN finite
  // number after trimming. Doesn't accept "" (empty string parses to 0
  // in Number() so guard explicitly).
  if (s.length === 0) return false
  const n = Number(s)
  return Number.isFinite(n)
}

/**
 * Returns the unique sizes from a variants array, sorted by the canonical
 * clothing order:
 *   1. Letter sizes (XXS → XS → S → M → L → XL → XXL → XXXL).
 *   2. Numeric sizes (ascending).
 *   3. Anything else (lexicographic).
 *
 * The function never throws on weird input — unknown sizes simply land in
 * the "anything else" bucket at the end.
 */
export function deriveSizes(variants: ReadonlyArray<VariantLike>): string[] {
  const seen = new Set<string>()
  for (const v of variants) {
    if (v.size.length > 0) seen.add(v.size)
  }
  const unique = [...seen]
  const letters: LetterSize[] = []
  const numerics: string[] = []
  const others: string[] = []
  for (const s of unique) {
    if (isLetterSize(s)) {
      letters.push(s)
    } else if (isNumericSize(s)) {
      numerics.push(s)
    } else {
      others.push(s)
    }
  }
  letters.sort(
    (a, b) => LETTER_SIZE_ORDER.indexOf(a) - LETTER_SIZE_ORDER.indexOf(b),
  )
  numerics.sort((a, b) => Number(a) - Number(b))
  others.sort()
  return [...letters, ...numerics, ...others]
}
