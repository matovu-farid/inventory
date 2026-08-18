export type DetailMode = 'aggregate' | 'colors' | 'variants'

export interface DetailColor {
  id: string
  colorName: string
  colorHex: string
}

export interface DetailCell {
  itemColorId?: string
  size?: string
  quantity: number
}

const detailModeLabels: Record<DetailMode, string> = {
  aggregate: 'Total only',
  colors: 'Per color',
  variants: 'Per color × size',
}

export function getDetailModeOptions(
  colors: readonly DetailColor[],
  sizes: readonly string[],
) {
  const hasColors = colors.length > 0
  const hasSizes = hasColors && sizes.length > 0

  return [
    { value: 'aggregate' as const, label: detailModeLabels.aggregate },
    ...(hasColors
      ? [{ value: 'colors' as const, label: detailModeLabels.colors }]
      : []),
    ...(hasSizes
      ? [{ value: 'variants' as const, label: detailModeLabels.variants }]
      : []),
  ]
}

export function normalizeDetailMode(
  mode: DetailMode,
  colors: readonly DetailColor[],
  sizes: readonly string[],
): DetailMode {
  return getDetailModeOptions(colors, sizes).some(
    (option) => option.value === mode,
  )
    ? mode
    : 'aggregate'
}

export function buildDetailCells(
  detailMode: DetailMode,
  aggregateQty: string,
  colorQtys: Record<string, number>,
  quantities: Record<string, number>,
): DetailCell[] {
  if (detailMode === 'aggregate') {
    const quantity = Number(aggregateQty)
    return Number.isInteger(quantity) && quantity > 0 ? [{ quantity }] : []
  }

  if (detailMode === 'colors') {
    return Object.entries(colorQtys)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemColorId, quantity]) => ({ itemColorId, quantity }))
  }

  const cells: DetailCell[] = []
  for (const [key, quantity] of Object.entries(quantities)) {
    if (quantity <= 0) continue
    const separator = key.indexOf('|')
    if (separator < 0) continue
    const itemColorId = key.slice(0, separator)
    const size = key.slice(separator + 1)
    if (itemColorId && size) cells.push({ itemColorId, size, quantity })
  }
  return cells
}
