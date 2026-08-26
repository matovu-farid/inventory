import BigNumber from 'bignumber.js'
import { convertExpenseToUgx } from '#/lib/currency/expense-conversion'

export interface SupplyRouteReviewLineInput {
  date?: string | null
  supplierName?: string | null
  articleNumber?: string | null
  itemName?: string | null
  design?: string | null
  colorName?: string | null
  size?: string | null
  quantity: number
  unitPriceForeign: string
  foreignCurrency: string
  exchangeRateForeignToUsd?: string | null
  exchangeRateUsdToUgx?: string | null
  totalAmountForeign: string
  totalAmountUsd?: string | null
  totalCostUgx: string
  minimumSellPriceUgx: string | null
}

export interface SupplyRouteReviewExpenseInput {
  category: string
  description?: string | null
  amount: string
  currency?: string | null
  exchangeRate?: string | null
}

export interface SupplyRouteReviewLine {
  date: string | null
  supplierName: string
  articleNumber: string
  itemName: string
  design: string
  colorName: string | null
  size: string | null
  quantity: number
  sourceUnitCost: BigNumber
  sourceCurrency: string
  sourceTotal: BigNumber
  totalAmountUsd: BigNumber | null
  exchangeRateForeignToUsd: BigNumber | null
  exchangeRateUsdToUgx: BigNumber | null
  landedCostUgx: BigNumber
  unitCostUgx: BigNumber
  minimumSellPriceUgx: BigNumber | null
  sellingValueUgx: BigNumber
  grossProfitUgx: BigNumber
}

export interface SupplyRouteReviewExpense {
  category: string
  description: string | null
  amount: BigNumber
  currency: string
  exchangeRate: BigNumber | null
  convertedAmountUgx: BigNumber | null
}

export interface SupplyRouteReviewTotals {
  units: number
  sourceSpend: {
    RMB: BigNumber
    USD: BigNumber
    UGX: BigNumber
  }
  expenseByCategory: Record<string, BigNumber>
  unsupportedSourceSpend: Record<string, BigNumber>
  itemCostUgx: BigNumber
  expenseTotalUgx: BigNumber
  totalCostUgx: BigNumber
  totalSellingValueUgx: BigNumber
  totalUsdEquivalent: BigNumber
  grossProfitUgx: BigNumber
  netProfitUgx: BigNumber
  missingExpenseConversions: number
}

export interface SupplyRouteReview {
  lines: SupplyRouteReviewLine[]
  expenses: SupplyRouteReviewExpense[]
  totals: SupplyRouteReviewTotals
}

export interface SupplyRouteReviewItemGroup {
  key: string
  itemName: string
  design: string
  articleNumber: string
  supplierNames: string[]
  dates: string[]
  lines: SupplyRouteReviewLine[]
  units: number
  itemCostUgx: BigNumber
  sellingValueUgx: BigNumber
  grossProfitUgx: BigNumber
}

const supportedCurrencies = ['RMB', 'USD', 'UGX'] as const
type SupportedCurrency = (typeof supportedCurrencies)[number]

function asBigNumber(value: string | null | undefined): BigNumber {
  return new BigNumber(value ?? '0')
}

function parseOptionalRate(value: string | null | undefined) {
  return value ? new BigNumber(value) : null
}

function expenseToUgx(expense: SupplyRouteReviewExpenseInput) {
  const currency = expense.currency ?? 'UGX'
  if (currency !== 'UGX' && !expense.exchangeRate) return null

  try {
    return asBigNumber(
      convertExpenseToUgx({
        amount: expense.amount,
        currency,
        exchangeRate: expense.exchangeRate ?? undefined,
      }),
    )
  } catch {
    return null
  }
}

export function buildSupplyRouteReview(
  lineInputs: ReadonlyArray<SupplyRouteReviewLineInput>,
  expenseInputs: ReadonlyArray<SupplyRouteReviewExpenseInput> = [],
): SupplyRouteReview {
  const sourceSpend: Record<SupportedCurrency, BigNumber> = {
    RMB: new BigNumber(0),
    USD: new BigNumber(0),
    UGX: new BigNumber(0),
  }
  const unsupportedSourceSpend: Record<string, BigNumber> = {}

  const lines = lineInputs.map((input) => {
    const quantity = input.quantity
    const landedCostUgx = asBigNumber(input.totalCostUgx)
    const parsedMinimumSellPrice = asBigNumber(input.minimumSellPriceUgx)
    const minimumSellPriceUgx = parsedMinimumSellPrice.gt(0)
      ? parsedMinimumSellPrice
      : null
    const sellingValueUgx = (minimumSellPriceUgx ?? new BigNumber(0)).times(
      quantity,
    )
    const sourceCurrency = input.foreignCurrency || 'UGX'
    const sourceTotal = asBigNumber(input.totalAmountForeign)
    const sourceBucket = sourceCurrency.toUpperCase() as SupportedCurrency

    if (supportedCurrencies.includes(sourceBucket)) {
      sourceSpend[sourceBucket] = sourceSpend[sourceBucket].plus(sourceTotal)
    } else {
      unsupportedSourceSpend[sourceCurrency] = (
        unsupportedSourceSpend[sourceCurrency] ?? new BigNumber(0)
      ).plus(sourceTotal)
    }

    return {
      supplierName: input.supplierName || 'Unknown supplier',
      date: input.date ?? null,
      articleNumber: input.articleNumber || '—',
      itemName: input.itemName || 'Item',
      design: input.design || '—',
      colorName: input.colorName ?? null,
      size: input.size ?? null,
      quantity,
      sourceUnitCost: asBigNumber(input.unitPriceForeign),
      sourceCurrency,
      sourceTotal,
      totalAmountUsd: input.totalAmountUsd
        ? asBigNumber(input.totalAmountUsd)
        : null,
      exchangeRateForeignToUsd: parseOptionalRate(
        input.exchangeRateForeignToUsd,
      ),
      exchangeRateUsdToUgx: parseOptionalRate(input.exchangeRateUsdToUgx),
      landedCostUgx,
      unitCostUgx:
        quantity > 0 ? landedCostUgx.div(quantity) : new BigNumber(0),
      minimumSellPriceUgx,
      sellingValueUgx,
      grossProfitUgx: sellingValueUgx.minus(landedCostUgx),
    }
  })

  const expenses = expenseInputs.map((input) => ({
    category: input.category,
    description: input.description ?? null,
    amount: asBigNumber(input.amount),
    currency: input.currency ?? 'UGX',
    exchangeRate: parseOptionalRate(input.exchangeRate),
    convertedAmountUgx: expenseToUgx(input),
  }))

  const expenseByCategory = expenses.reduce<Record<string, BigNumber>>(
    (totals, expense) => {
      if (!expense.convertedAmountUgx) return totals
      totals[expense.category] = (
        totals[expense.category] ?? new BigNumber(0)
      ).plus(expense.convertedAmountUgx)
      return totals
    },
    {},
  )

  const itemCostUgx = lines.reduce(
    (total, line) => total.plus(line.landedCostUgx),
    new BigNumber(0),
  )
  const expenseTotalUgx = expenses.reduce(
    (total, expense) =>
      expense.convertedAmountUgx
        ? total.plus(expense.convertedAmountUgx)
        : total,
    new BigNumber(0),
  )
  const totalSellingValueUgx = lines.reduce(
    (total, line) => total.plus(line.sellingValueUgx),
    new BigNumber(0),
  )
  const totalUsdEquivalent = lines.reduce(
    (total, line) =>
      line.totalAmountUsd ? total.plus(line.totalAmountUsd) : total,
    new BigNumber(0),
  )
  const totalCostUgx = itemCostUgx.plus(expenseTotalUgx)
  const grossProfitUgx = totalSellingValueUgx.minus(itemCostUgx)
  const netProfitUgx = grossProfitUgx.minus(expenseTotalUgx)

  return {
    lines,
    expenses,
    totals: {
      units: lines.reduce((total, line) => total + line.quantity, 0),
      sourceSpend,
      expenseByCategory,
      unsupportedSourceSpend,
      itemCostUgx,
      expenseTotalUgx,
      totalCostUgx,
      totalSellingValueUgx,
      totalUsdEquivalent,
      grossProfitUgx,
      netProfitUgx,
      missingExpenseConversions: expenses.filter(
        (expense) => expense.convertedAmountUgx === null,
      ).length,
    },
  }
}

export function groupSupplyRouteReviewLines(
  lines: ReadonlyArray<SupplyRouteReviewLine>,
): SupplyRouteReviewItemGroup[] {
  const groups = new Map<string, SupplyRouteReviewItemGroup>()

  for (const line of lines) {
    const key = `${line.articleNumber}::${line.itemName}::${line.design}`
    const existing = groups.get(key)

    if (existing) {
      existing.lines.push(line)
      existing.units += line.quantity
      existing.itemCostUgx = existing.itemCostUgx.plus(line.landedCostUgx)
      existing.sellingValueUgx = existing.sellingValueUgx.plus(
        line.sellingValueUgx,
      )
      existing.grossProfitUgx = existing.grossProfitUgx.plus(
        line.grossProfitUgx,
      )
      if (!existing.supplierNames.includes(line.supplierName)) {
        existing.supplierNames.push(line.supplierName)
      }
      if (line.date && !existing.dates.includes(line.date)) {
        existing.dates.push(line.date)
      }
      continue
    }

    groups.set(key, {
      key,
      itemName: line.itemName,
      design: line.design,
      articleNumber: line.articleNumber,
      supplierNames: [line.supplierName],
      dates: line.date ? [line.date] : [],
      lines: [line],
      units: line.quantity,
      itemCostUgx: line.landedCostUgx,
      sellingValueUgx: line.sellingValueUgx,
      grossProfitUgx: line.grossProfitUgx,
    })
  }

  return [...groups.values()]
}
