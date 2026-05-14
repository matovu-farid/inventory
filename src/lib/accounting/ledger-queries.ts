import { eq, and, lte, sql } from "drizzle-orm"
import BigNumber from "bignumber.js"
import { transactions, transactionCategories } from "#/db/schema"
import type { Database } from "#/db"

const NORMAL_DEBIT_TYPES = ["asset", "expense"]

/**
 * Get the balance for a specific account category at a location.
 *
 * Assets/Expenses: DR increases, CR decreases (normal debit balance)
 * Liabilities/Equity/Revenue: CR increases, DR decreases (normal credit balance)
 */
export async function getCategoryBalance(
  db: Database,
  categoryName: string,
  locationType: "store" | "shop",
  locationId: string,
  asOf?: Date,
): Promise<BigNumber> {
  const category = await db
    .select({
      id: transactionCategories.id,
      type: transactionCategories.type,
    })
    .from(transactionCategories)
    .where(eq(transactionCategories.name, categoryName))
    .limit(1)
    .then((rows) => rows.at(0))

  if (!category) {
    throw new Error(`Category not found: "${categoryName}"`)
  }

  const conditions = [
    eq(transactions.categoryId, category.id),
    eq(transactions.locationType, locationType),
    eq(transactions.locationId, locationId),
  ]

  if (asOf) {
    conditions.push(lte(transactions.transactionDate, asOf))
  }

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.type)

  const isNormalDebit = NORMAL_DEBIT_TYPES.includes(category.type)
  let balance = new BigNumber(0)

  for (const row of rows) {
    if (!row.total) continue
    const amount = new BigNumber(row.total)
    if (amount.isNaN()) continue
    if (row.type === "debit") {
      balance = isNormalDebit ? balance.plus(amount) : balance.minus(amount)
    } else {
      balance = isNormalDebit ? balance.minus(amount) : balance.plus(amount)
    }
  }

  return balance
}

/**
 * Get trial balance — all categories with their balances.
 */
export async function getTrialBalance(
  db: Database,
  asOf?: Date,
): Promise<
  Array<{
    categoryName: string
    categoryType: string
    debitTotal: BigNumber
    creditTotal: BigNumber
    balance: BigNumber
  }>
> {
  const dateCondition = asOf ? lte(transactions.transactionDate, asOf) : undefined

  const rows = await db
    .select({
      categoryName: transactionCategories.name,
      categoryType: transactionCategories.type,
      txnType: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
    .where(dateCondition)
    .groupBy(transactionCategories.name, transactionCategories.type, transactions.type)

  // Aggregate by category
  const categoryMap = new Map<
    string,
    {
      categoryName: string
      categoryType: string
      debitTotal: BigNumber
      creditTotal: BigNumber
    }
  >()

  for (const row of rows) {
    if (!row.total) continue
    let entry = categoryMap.get(row.categoryName)
    if (!entry) {
      entry = {
        categoryName: row.categoryName,
        categoryType: row.categoryType,
        debitTotal: new BigNumber(0),
        creditTotal: new BigNumber(0),
      }
      categoryMap.set(row.categoryName, entry)
    }
    if (row.txnType === "debit") {
      entry.debitTotal = entry.debitTotal.plus(row.total)
    } else {
      entry.creditTotal = entry.creditTotal.plus(row.total)
    }
  }

  return Array.from(categoryMap.values()).map((entry) => {
    const isNormalDebit = NORMAL_DEBIT_TYPES.includes(entry.categoryType)
    const balance = isNormalDebit
      ? entry.debitTotal.minus(entry.creditTotal)
      : entry.creditTotal.minus(entry.debitTotal)

    return { ...entry, balance }
  })
}

/**
 * Get all balances for a specific location.
 */
export async function getLocationBalances(
  db: Database,
  locationType: "store" | "shop",
  locationId: string,
  asOf?: Date,
): Promise<
  Array<{
    categoryName: string
    categoryType: string
    balance: BigNumber
  }>
> {
  const conditions = [
    eq(transactions.locationType, locationType),
    eq(transactions.locationId, locationId),
  ]
  if (asOf) {
    conditions.push(lte(transactions.transactionDate, asOf))
  }

  const rows = await db
    .select({
      categoryName: transactionCategories.name,
      categoryType: transactionCategories.type,
      txnType: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
    .where(and(...conditions))
    .groupBy(transactionCategories.name, transactionCategories.type, transactions.type)

  const categoryMap = new Map<
    string,
    { categoryName: string; categoryType: string; debit: BigNumber; credit: BigNumber }
  >()

  for (const row of rows) {
    if (!row.total) continue
    let entry = categoryMap.get(row.categoryName)
    if (!entry) {
      entry = {
        categoryName: row.categoryName,
        categoryType: row.categoryType,
        debit: new BigNumber(0),
        credit: new BigNumber(0),
      }
      categoryMap.set(row.categoryName, entry)
    }
    if (row.txnType === "debit") {
      entry.debit = entry.debit.plus(row.total)
    } else {
      entry.credit = entry.credit.plus(row.total)
    }
  }

  return Array.from(categoryMap.values()).map((entry) => {
    const isNormalDebit = NORMAL_DEBIT_TYPES.includes(entry.categoryType)
    const balance = isNormalDebit
      ? entry.debit.minus(entry.credit)
      : entry.credit.minus(entry.debit)
    return { categoryName: entry.categoryName, categoryType: entry.categoryType, balance }
  })
}
