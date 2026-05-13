import { z } from "zod"
import BigNumber from "bignumber.js"

export const cellSchema = z.object({
  productColorId: z.string().uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive(),
})

export const variantInput = z.object({
  supplyRouteId: z.string().uuid(),
  supplierId: z.string().uuid(),
  unitPriceForeign: z.string(),
  foreignCurrency: z.string().default("RMB"),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
  cells: z.array(cellSchema).min(1),
})

export type MaterializedRow = {
  supplyRouteId: string
  supplierId: string
  productColorId: string
  size: string
  quantity: number
  unitPriceForeign: string
  foreignCurrency: string
  exchangeRateForeignToUsd?: string
  exchangeRateUsdToUgx?: string
  totalAmountForeign: string
  totalAmountUsd: string | null
  totalCostUgx: string
}

export function materializeVariantRows(input: z.infer<typeof variantInput>): MaterializedRow[] {
  const cells = input.cells.filter((c) => c.quantity > 0)
  const unitPrice = new BigNumber(input.unitPriceForeign)
  const isUsd = input.foreignCurrency === "USD"
  const fxToUsdStr = isUsd ? input.exchangeRateForeignToUsd ?? "1" : input.exchangeRateForeignToUsd

  return cells.map((cell) => {
    const totalAmountForeign = unitPrice.times(cell.quantity).toFixed(2)
    let totalAmountUsd: string | null = null
    let totalCostUgx: string
    if (input.foreignCurrency === "UGX" || !fxToUsdStr || !input.exchangeRateUsdToUgx) {
      totalCostUgx = totalAmountForeign
    } else {
      const fxToUsd = new BigNumber(fxToUsdStr)
      if (fxToUsd.isZero()) throw new Error("Exchange rate cannot be zero")
      const usdToUgx = new BigNumber(input.exchangeRateUsdToUgx)
      totalAmountUsd = new BigNumber(totalAmountForeign).div(fxToUsd).dp(2, BigNumber.ROUND_HALF_UP).toFixed(2)
      totalCostUgx = unitPrice.div(fxToUsd).times(usdToUgx).times(cell.quantity).dp(2, BigNumber.ROUND_HALF_UP).toFixed(2)
    }
    return {
      supplyRouteId: input.supplyRouteId,
      supplierId: input.supplierId,
      productColorId: cell.productColorId,
      size: cell.size,
      quantity: cell.quantity,
      unitPriceForeign: input.unitPriceForeign,
      foreignCurrency: input.foreignCurrency,
      exchangeRateForeignToUsd: input.exchangeRateForeignToUsd,
      exchangeRateUsdToUgx: input.exchangeRateUsdToUgx,
      totalAmountForeign,
      totalAmountUsd,
      totalCostUgx,
    }
  })
}
