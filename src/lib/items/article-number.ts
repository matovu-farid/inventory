function normalizePart(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
}

function compact(value: string, maxLength: number): string {
  return normalizePart(value).slice(0, maxLength).replace(/-+$/g, '')
}

/**
 * Suggests a readable, editable article number and avoids active collisions
 * when the caller supplies the current catalog numbers.
 */
export function suggestArticleNumber(input: {
  category: string
  name: string
  existingArticleNumbers?: ReadonlySet<string>
}): string {
  const categoryPart = compact(input.category, 8)
  const namePart = compact(input.name, 18)
  const base = (
    !categoryPart && !namePart
      ? ''
      : categoryPart && namePart
        ? `${categoryPart}-${namePart}`
        : categoryPart || namePart
  ).slice(0, 64)

  if (!base || !input.existingArticleNumbers?.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const suffixText = `-${suffix}`
    const candidate = `${base.slice(0, 64 - suffixText.length)}${suffixText}`
    if (!input.existingArticleNumbers.has(candidate)) return candidate
  }
}
