function normalizePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
}

export function normalizeArticleNumber(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (!normalized) throw new Error('Article number is required')
  return normalized
}

export function formatItemArticleNumbers(
  articleNumbers: ReadonlyArray<{ articleNumber: string }>,
): string {
  return articleNumbers.map((number) => number.articleNumber).join(', ') || '?'
}

export function primaryItemArticleNumber(
  articleNumbers: ReadonlyArray<{ articleNumber: string }>,
): string {
  return articleNumbers[0]?.articleNumber ?? ''
}

function compact(value: string, maxLength: number): string {
  return normalizePart(value).slice(0, maxLength).replace(/-+$/g, '')
}

/**
 * Suggests a readable, editable article number and avoids active collisions
 * when the caller supplies the current catalog numbers.
 */
export function suggestArticleNumber(input: {
  design: string
  name: string
  existingArticleNumbers?: ReadonlySet<string>
}): string {
  const designPart = compact(input.design, 8)
  const namePart = compact(input.name, 18)
  const base = (
    !designPart && !namePart
      ? ''
      : designPart && namePart
        ? `${designPart}-${namePart}`
        : designPart || namePart
  ).slice(0, 64)

  if (!base || !input.existingArticleNumbers?.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const suffixText = `-${suffix}`
    const candidate = `${base.slice(0, 64 - suffixText.length)}${suffixText}`
    if (!input.existingArticleNumbers.has(candidate)) return candidate
  }
}
