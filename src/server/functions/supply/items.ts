import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { supplyRouteItems } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const addItemInput = z.object({
  supplyRouteId: z.string().uuid(),
  supplierId: z.string().uuid(),
  productName: z.string().min(1),
  articleNumber: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPriceForeign: z.string(),
  foreignCurrency: z.string().default("RMB"),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
})

export const addSupplyRouteItem = createServerFn()
  .inputValidator(addItemInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const unitPrice = new BigNumber(data.unitPriceForeign)
    const qty = data.quantity

    const totalAmountForeign = unitPrice.times(qty).toFixed(2)

    let totalAmountUsd: string | null = null
    let totalCostUgx: string

    if (
      data.foreignCurrency === "UGX" ||
      !data.exchangeRateForeignToUsd ||
      !data.exchangeRateUsdToUgx
    ) {
      // Local purchase — already in UGX
      totalCostUgx = totalAmountForeign
    } else {
      const fxToUsd = new BigNumber(data.exchangeRateForeignToUsd)
      if (fxToUsd.isZero()) throw new Error("Exchange rate cannot be zero")
      const usdToUgx = new BigNumber(data.exchangeRateUsdToUgx)

      totalAmountUsd = new BigNumber(totalAmountForeign)
        .div(fxToUsd)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)

      totalCostUgx = unitPrice
        .div(fxToUsd)
        .times(usdToUgx)
        .times(qty)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)
    }

    const [item] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: data.supplyRouteId,
        supplierId: data.supplierId,
        productName: data.productName,
        articleNumber: data.articleNumber,
        quantity: qty,
        unitPriceForeign: data.unitPriceForeign,
        foreignCurrency: data.foreignCurrency,
        exchangeRateForeignToUsd: data.exchangeRateForeignToUsd,
        exchangeRateUsdToUgx: data.exchangeRateUsdToUgx,
        totalAmountForeign,
        totalAmountUsd,
        totalCostUgx,
      })
      .returning()

    return item
  })

const updateItemInput = z.object({
  id: z.string().uuid(),
  productName: z.string().min(1).optional(),
  articleNumber: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  unitPriceForeign: z.string().optional(),
  foreignCurrency: z.string().optional(),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
})

export const updateSupplyRouteItem = createServerFn()
  .inputValidator(updateItemInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const { id, ...fields } = data

    // If price/quantity/exchange rate fields changed, recompute totals
    const existing = await db.query.supplyRouteItems.findFirst({
      where: eq(supplyRouteItems.id, id),
    })
    if (!existing) throw new Error("Item not found")

    const unitPrice = new BigNumber(fields.unitPriceForeign ?? existing.unitPriceForeign)
    const qty = fields.quantity ?? existing.quantity
    const currency = fields.foreignCurrency ?? existing.foreignCurrency
    const fxToUsdStr = fields.exchangeRateForeignToUsd ?? existing.exchangeRateForeignToUsd
    const usdToUgxStr = fields.exchangeRateUsdToUgx ?? existing.exchangeRateUsdToUgx

    const totalAmountForeign = unitPrice.times(qty).toFixed(2)

    let totalAmountUsd: string | null = null
    let totalCostUgx: string

    if (currency === "UGX" || !fxToUsdStr || !usdToUgxStr) {
      totalCostUgx = totalAmountForeign
    } else {
      const fxToUsd = new BigNumber(fxToUsdStr)
      if (fxToUsd.isZero()) throw new Error("Exchange rate cannot be zero")
      const usdToUgx = new BigNumber(usdToUgxStr)

      totalAmountUsd = new BigNumber(totalAmountForeign)
        .div(fxToUsd)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)

      totalCostUgx = unitPrice
        .div(fxToUsd)
        .times(usdToUgx)
        .times(qty)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)
    }

    const [item] = await db
      .update(supplyRouteItems)
      .set({
        ...fields,
        totalAmountForeign,
        totalAmountUsd,
        totalCostUgx,
      })
      .where(eq(supplyRouteItems.id, id))
      .returning()

    return item
  })

const deleteItemInput = z.object({ id: z.string().uuid() })

export const deleteSupplyRouteItem = createServerFn()
  .inputValidator(deleteItemInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    await db.delete(supplyRouteItems).where(eq(supplyRouteItems.id, data.id))
  })

/**
 * Get distinct product names used in previous supply route items,
 * for autocomplete suggestions.
 */
export const getProductNameSuggestions = createServerFn()
  .inputValidator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const rows = await db
      .selectDistinct({ productName: supplyRouteItems.productName })
      .from(supplyRouteItems)
      .limit(20)

    return rows
      .map((r) => r.productName)
      .filter((name) => name.toLowerCase().includes(data.query.toLowerCase()))
  })
