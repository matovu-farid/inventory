import type {
  DistributionValidation,
  ReceiptQuantityDistribution,
} from './distribution-types'

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function distributionTotal(
  distribution: ReceiptQuantityDistribution | null,
): number {
  return (
    distribution?.cells.reduce((total, cell) => {
      return total + (Number.isFinite(cell.quantity) ? cell.quantity : 0)
    }, 0) ?? 0
  )
}

export function cloneDistribution(
  distribution: ReceiptQuantityDistribution | null,
): ReceiptQuantityDistribution | null {
  if (!distribution) return null
  return {
    mode: distribution.mode,
    cells: distribution.cells.map((cell) => ({ ...cell })),
  }
}

function invalid(
  total: number,
  quantity: number | null,
  message: string,
): DistributionValidation {
  return {
    valid: false,
    total,
    difference: quantity === null ? 0 : total - quantity,
    message,
  }
}

export function validateDistribution(
  distribution: ReceiptQuantityDistribution | null,
  quantity: number | null,
): DistributionValidation {
  if (quantity === null || !Number.isInteger(quantity) || quantity < 0) {
    return invalid(
      distributionTotal(distribution),
      quantity,
      'Enter a valid quantity first',
    )
  }
  if (!distribution) {
    return { valid: true, total: quantity, difference: 0 }
  }
  if (distribution.cells.length === 0) {
    return invalid(0, quantity, 'Add at least one allocation')
  }

  const keys = new Set<string>()
  let total = 0
  let firstError: string | undefined
  for (const cell of distribution.cells) {
    const color = normalize(cell.color)
    const quantityIsValid =
      Number.isInteger(cell.quantity) && cell.quantity >= 0
    if (quantityIsValid) total += cell.quantity
    if (!color) {
      firstError ??= 'Every allocation needs a colour'
      continue
    }
    if (!quantityIsValid) {
      firstError ??= `Allocation for ${cell.color.trim()} needs a whole number`
      continue
    }
    const size = cell.size ? normalize(cell.size) : ''
    if (distribution.mode === 'colors' && size) {
      firstError ??= 'Colour-only allocations cannot include sizes'
    }
    if (distribution.mode === 'variants' && !size) {
      firstError ??= `Allocation for ${cell.color.trim()} needs a size`
    }
    const key = `${color}\u0000${distribution.mode === 'variants' ? size : ''}`
    if (keys.has(key)) {
      firstError ??= `Remove the duplicate allocation for ${cell.color.trim()}${cell.size ? ` / ${cell.size.trim()}` : ''}`
    }
    keys.add(key)
  }
  if (firstError) {
    return invalid(total, quantity, firstError)
  }

  const difference = total - quantity
  if (difference !== 0) {
    const direction = difference < 0 ? 'more' : 'fewer'
    return {
      valid: false,
      total,
      difference,
      message: `Allocate ${formatQuantity(Math.abs(difference))} ${direction} to match ${formatQuantity(quantity)}`,
    }
  }
  return { valid: true, total, difference: 0 }
}

export function distributionSummary(
  distribution: ReceiptQuantityDistribution,
): string {
  const colors = new Set(
    distribution.cells.map((cell) => normalize(cell.color)),
  )
  const sizes = new Set(
    distribution.cells
      .map((cell) => (cell.size ? normalize(cell.size) : ''))
      .filter(Boolean),
  )
  const total = formatQuantity(distributionTotal(distribution))
  if (distribution.mode === 'colors') {
    return `${total} · ${colors.size} colour${colors.size === 1 ? '' : 's'}`
  }
  return `${total} · ${colors.size} colour${colors.size === 1 ? '' : 's'} × ${sizes.size} size${sizes.size === 1 ? '' : 's'}`
}
