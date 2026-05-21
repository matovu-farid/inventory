import { eq, and, lte, sql } from "drizzle-orm"
import BigNumber from "bignumber.js"
import { transactions, transactionCategories } from "#/db/schema"
import type { Database } from "#/db"

/**
 * Account types whose balance increases on a debit entry. The complement —
 * liability, equity, revenue — increases on a credit entry.
 */
export const NORMAL_DEBIT_ACCOUNT_TYPES = ["asset", "expense"] as const

/**
 * Compute an account balance from its debit/credit totals, applying the
 * normal-balance rule for the account type.
 *
 * Assets/Expenses: DR increases, CR decreases (balance = DR − CR)
 * Liabilities/Equity/Revenue: CR increases, DR decreases (balance = CR − DR)
 *
 * Tests can import this function directly to validate the rule without
 * needing a database.
 */
export function computeAccountBalance(
  accountType: string,
  debits: BigNumber.Value,
  credits: BigNumber.Value,
): BigNumber {
  const dr = new BigNumber(debits)
  const cr = new BigNumber(credits)
  const isNormalDebit = (NORMAL_DEBIT_ACCOUNT_TYPES as readonly string[]).includes(accountType)
  return isNormalDebit ? dr.minus(cr) : cr.minus(dr)
}

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

  let debits = new BigNumber(0)
  let credits = new BigNumber(0)

  for (const row of rows) {
    if (!row.total) continue
    const amount = new BigNumber(row.total)
    if (amount.isNaN()) continue
    if (row.type === "debit") debits = debits.plus(amount)
    else credits = credits.plus(amount)
  }

  return computeAccountBalance(category.type, debits, credits)
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

  return Array.from(categoryMap.values()).map((entry) => ({
    ...entry,
    balance: computeAccountBalance(
      entry.categoryType,
      entry.debitTotal,
      entry.creditTotal,
    ),
  }))
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

  return Array.from(categoryMap.values()).map((entry) => ({
    categoryName: entry.categoryName,
    categoryType: entry.categoryType,
    balance: computeAccountBalance(entry.categoryType, entry.debit, entry.credit),
  }))
}
