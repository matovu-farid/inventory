export type ReceiptDistributionMode = 'colors' | 'variants'

export type ReceiptDistributionCell = {
  color: string
  colorId?: string | null
  colorHex?: string | null
  size?: string
  quantity: number
}

export type ReceiptQuantityDistribution = {
  mode: ReceiptDistributionMode
  cells: ReceiptDistributionCell[]
}

export type DistributionValidation = {
  valid: boolean
  total: number
  difference: number
  message?: string
}
