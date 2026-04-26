import { createServerFn } from "@tanstack/react-start"
import { eq, and, sql } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { transactions, transactionCategories, bankAccounts } from "#/db/schema"
import { getTrialBalance } from "#/lib/accounting/ledger-queries"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const dateRangeInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
})

/**
 * Trial Balance — all categories with DR/CR totals.
 */
export const getTrialBalanceReport = createServerFn()
  .inputValidator(dateRangeInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const asOf = data.to ? new Date(data.to) : undefined
    const tb = await getTrialBalance(db, asOf)

    return tb.map((row) => ({
      categoryName: row.categoryName,
      categoryType: row.categoryType,
      debitTotal: row.debitTotal.toFixed(2),
      creditTotal: row.creditTotal.toFixed(2),
      balance: row.balance.toFixed(2),
    }))
  })

/**
 * Profit & Loss — revenue minus expenses for a period.
 */
export const getProfitAndLoss = createServerFn()
  .inputValidator(dateRangeInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const conditions = []
    if (data.from) conditions.push(sql`${transactions.transactionDate} >= ${new Date(data.from)}`)
    if (data.to) conditions.push(sql`${transactions.transactionDate} <= ${new Date(data.to)}`)

    const rows = await db
      .select({
        categoryName: transactionCategories.name,
        categoryType: transactionCategories.type,
        txnType: transactions.type,
        total: sql<string>`sum(${transactions.amount})`,
      })
      .from(transactions)
      .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(transactionCategories.name, transactionCategories.type, transactions.type)

    const revenueItems: Array<{ name: string; amount: string }> = []
    const expenseItems: Array<{ name: string; amount: string }> = []

    // Group by category
    const catMap = new Map<string, { type: string; debit: BigNumber; credit: BigNumber }>()
    for (const row of rows) {
      if (!["revenue", "expense"].includes(row.categoryType)) continue
      if (!catMap.has(row.categoryName)) {
        catMap.set(row.categoryName, { type: row.categoryType, debit: new BigNumber(0), credit: new BigNumber(0) })
      }
      const e = catMap.get(row.categoryName)!
      if (row.txnType === "debit") e.debit = e.debit.plus(row.total)
      else e.credit = e.credit.plus(row.total)
    }

    let totalRevenue = new BigNumber(0)
    let totalExpenses = new BigNumber(0)

    for (const [name, e] of catMap) {
      if (e.type === "revenue") {
        const bal = e.credit.minus(e.debit)
        revenueItems.push({ name, amount: bal.toFixed(2) })
        totalRevenue = totalRevenue.plus(bal)
      } else {
        const bal = e.debit.minus(e.credit)
        expenseItems.push({ name, amount: bal.toFixed(2) })
        totalExpenses = totalExpenses.plus(bal)
      }
    }

    return {
      revenueItems,
      expenseItems,
      totalRevenue: totalRevenue.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netIncome: totalRevenue.minus(totalExpenses).toFixed(2),
    }
  })

/**
 * Balance Sheet — assets, liabilities, equity at a point in time.
 */
export const getBalanceSheet = createServerFn()
  .inputValidator(z.object({ asOf: z.string().optional() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const asOf = data.asOf ? new Date(data.asOf) : undefined
    const tb = await getTrialBalance(db, asOf)

    const assets: Array<{ name: string; balance: string }> = []
    const liabilities: Array<{ name: string; balance: string }> = []
    const equity: Array<{ name: string; balance: string }> = []

    let totalAssets = new BigNumber(0)
    let totalLiabilities = new BigNumber(0)
    let totalEquity = new BigNumber(0)

    for (const row of tb) {
      const item = { name: row.categoryName, balance: row.balance.toFixed(2) }
      switch (row.categoryType) {
        case "asset":
          assets.push(item)
          totalAssets = totalAssets.plus(row.balance)
          break
        case "liability":
          liabilities.push(item)
          totalLiabilities = totalLiabilities.plus(row.balance)
          break
        case "equity":
          equity.push(item)
          totalEquity = totalEquity.plus(row.balance)
          break
        case "revenue":
        case "expense":
          // Net income goes into equity
          if (row.categoryType === "revenue") {
            totalEquity = totalEquity.plus(row.balance)
          } else {
            totalEquity = totalEquity.minus(row.balance)
          }
          break
      }
    }

    // Add net income to equity section
    const netIncome = totalAssets.minus(totalLiabilities).minus(totalEquity)
    if (!netIncome.isZero()) {
      equity.push({ name: "Retained Earnings", balance: netIncome.toFixed(2) })
      totalEquity = totalEquity.plus(netIncome)
    }

    return {
      assets,
      liabilities,
      equity,
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquity.toFixed(2),
    }
  })

/**
 * Cash position — cash + bank balances.
 */
export const getCashPosition = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  // Cash balance = sum of all Cash transactions
  const cashRows = await db
    .select({
      txnType: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
    .where(eq(transactionCategories.name, "Cash"))
    .groupBy(transactions.type)

  let cashBalance = new BigNumber(0)
  for (const r of cashRows) {
    if (r.txnType === "debit") cashBalance = cashBalance.plus(r.total)
    else cashBalance = cashBalance.minus(r.total)
  }

  // Bank balance
  const bankRows = await db
    .select({
      txnType: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
    .where(eq(transactionCategories.name, "Bank"))
    .groupBy(transactions.type)

  let bankBalance = new BigNumber(0)
  for (const r of bankRows) {
    if (r.txnType === "debit") bankBalance = bankBalance.plus(r.total)
    else bankBalance = bankBalance.minus(r.total)
  }

  // Bank accounts list
  const accounts = await db.select().from(bankAccounts).orderBy(bankAccounts.bankName)

  return {
    cashBalance: cashBalance.toFixed(2),
    bankBalance: bankBalance.toFixed(2),
    totalBalance: cashBalance.plus(bankBalance).toFixed(2),
    bankAccounts: accounts,
  }
})

/**
 * Inter-branch balances — what each shop owes the store.
 */
export const getInterBranchBalances = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  // Due from Shop by location
  const rows = await db
    .select({
      locationId: transactions.locationId,
      txnType: transactions.type,
      total: sql<string>`sum(${transactions.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
    .where(eq(transactionCategories.name, "Due from Shop"))
    .groupBy(transactions.locationId, transactions.type)

  const balanceMap = new Map<string, BigNumber>()
  for (const r of rows) {
    const current = balanceMap.get(r.locationId) ?? new BigNumber(0)
    if (r.txnType === "debit") balanceMap.set(r.locationId, current.plus(r.total))
    else balanceMap.set(r.locationId, current.minus(r.total))
  }

  return Array.from(balanceMap.entries()).map(([locationId, balance]) => ({
    locationId,
    balance: balance.toFixed(2),
  }))
})

/**
 * General ledger — paginated journal entries.
 */
export const getLedgerEntries = createServerFn()
  .inputValidator(
    z.object({
      limit: z.number().int().positive().default(50),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const entries = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        categoryName: transactionCategories.name,
        categoryType: transactionCategories.type,
        journalGroupId: transactions.journalGroupId,
        transactionDate: transactions.transactionDate,
        description: transactions.description,
        referenceType: transactions.referenceType,
        locationType: transactions.locationType,
      })
      .from(transactions)
      .innerJoin(transactionCategories, eq(transactions.categoryId, transactionCategories.id))
      .orderBy(sql`${transactions.transactionDate} DESC`)
      .limit(data.limit)
      .offset(data.offset)

    return entries
  })
