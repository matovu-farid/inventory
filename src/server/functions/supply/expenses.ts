import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import BigNumber from 'bignumber.js'
import { db } from '#/db'
import { supplyRouteExpenses, supplyRoutes, transactions } from '#/db/schema'
import { postJournalEntry, reverseJournalEntry } from '#/lib/accounting/ledger'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { convertExpenseToUgx } from './expense-fx'

/** Map supply-route expense categories to ledger account names. */
const expenseCategoryToLedger: Record<string, string> = {
  freight: 'Freight Expense',
  shipping: 'Freight Expense',
  customs: 'Customs Expense',
  ticket: 'Travel Expense',
  transportation: 'Transportation Expense',
  insurance: 'Miscellaneous Expense',
  rent: 'Rent Expense',
  salary: 'Salary Expense',
  tax: 'Tax Expense',
  miscellaneous: 'Miscellaneous Expense',
}

const positiveAmount = z.string().refine((value) => {
  const amount = new BigNumber(value)
  return amount.isFinite() && amount.gt(0)
}, 'Amount must be a positive number')

const exchangeRate = z.string().refine((value) => {
  const rate = new BigNumber(value)
  return rate.isFinite() && rate.gt(0)
}, 'Exchange rate must be a positive number')

const routeExpenseCurrency = z.enum(['UGX', 'USD', 'RMB'])

const addExpenseInput = z
  .object({
    supplyRouteId: z.uuid(),
    category: z.enum([
      'freight',
      'shipping',
      'customs',
      'ticket',
      'transportation',
      'insurance',
      'tax',
      'miscellaneous',
    ]),
    description: z.string().optional(),
    amount: positiveAmount,
    currency: routeExpenseCurrency.default('UGX'),
    exchangeRate: exchangeRate.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.currency !== 'UGX' && !data.exchangeRate) {
      ctx.addIssue({
        code: 'custom',
        path: ['exchangeRate'],
        message: 'Exchange rate is required for foreign expenses',
      })
    }
  })

type RouteExpenseJournalInput = {
  id: string
  category: string
  description?: string | null
  amount: string
  currency?: string | null
  exchangeRate?: string | null
  storeId: string
  recordedBy: string
}

async function postRouteExpenseJournal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  expense: RouteExpenseJournalInput,
) {
  const ledgerCategory =
    expenseCategoryToLedger[expense.category] ?? 'Miscellaneous Expense'
  const amountUgx = convertExpenseToUgx({
    amount: expense.amount,
    currency: expense.currency ?? 'UGX',
    exchangeRate: expense.exchangeRate ?? undefined,
  })

  await postJournalEntry(tx, {
    entries: [
      { type: 'debit', category: ledgerCategory, amount: amountUgx },
      { type: 'credit', category: 'Cash', amount: amountUgx },
    ],
    referenceType: 'supply_route',
    referenceId: expense.id,
    locationType: 'store',
    locationId: expense.storeId,
    depositLocation: 'cash',
    recordedBy: expense.recordedBy,
    description: `${expense.category}: ${expense.description ?? ''}`,
  })
}

async function reverseRouteExpenseJournal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  expenseId: string,
  recordedBy: string,
) {
  const journal = await tx
    .select({ journalGroupId: transactions.journalGroupId })
    .from(transactions)
    .where(
      and(
        eq(transactions.referenceType, 'supply_route'),
        eq(transactions.referenceId, expenseId),
        isNull(transactions.reversedByJournalGroupId),
        isNull(transactions.reversesJournalGroupId),
      ),
    )
    .limit(1)

  if (journal[0]) {
    await reverseJournalEntry(tx, journal[0].journalGroupId, {
      reason: `Supply route expense ${expenseId} changed or removed`,
      recordedBy,
    })
  }
}

export const addSupplyRouteExpense = createServerFn()
  .inputValidator(addExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin'])
    const userId = session.user.id

    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, data.supplyRouteId),
    })
    if (!route) throw new Error('Supply route not found')
    if (route.status !== 'open')
      throw new Error('Only open routes can be edited')

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error('Store not configured')

    return db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(supplyRouteExpenses)
        .values(data)
        .returning()

      await postRouteExpenseJournal(tx, {
        ...expense,
        storeId: store.id,
        recordedBy: userId,
      })

      return expense
    })
  })

const updateExpenseInput = z.object({
  id: z.uuid(),
  category: z
    .enum([
      'freight',
      'shipping',
      'customs',
      'ticket',
      'transportation',
      'insurance',
      'tax',
      'miscellaneous',
    ])
    .optional(),
  description: z.string().optional(),
  amount: positiveAmount.optional(),
  currency: routeExpenseCurrency.optional(),
  exchangeRate: exchangeRate.optional(),
})

export const updateSupplyRouteExpense = createServerFn()
  .inputValidator(updateExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin'])

    const { id, ...fields } = data
    return db.transaction(async (tx) => {
      const existing = await tx.query.supplyRouteExpenses.findFirst({
        where: eq(supplyRouteExpenses.id, id),
        with: { supplyRoute: true },
      })
      if (!existing) throw new Error('Expense not found')
      if (existing.supplyRoute.status !== 'open')
        throw new Error('Only open routes can be edited')

      const nextCurrency = fields.currency ?? existing.currency ?? 'UGX'
      const currencyChanged =
        fields.currency !== undefined && fields.currency !== existing.currency
      if (
        nextCurrency !== 'UGX' &&
        currencyChanged &&
        fields.exchangeRate === undefined
      ) {
        throw new Error(
          'Exchange rate is required when changing expense currency',
        )
      }
      if (
        nextCurrency !== 'UGX' &&
        !fields.exchangeRate &&
        !existing.exchangeRate
      ) {
        throw new Error('Exchange rate is required for foreign expenses')
      }

      const store = await tx.query.stores.findFirst()
      if (!store) throw new Error('Store not configured')

      await reverseRouteExpenseJournal(tx, id, session.user.id)
      const expense = (
        await tx
          .update(supplyRouteExpenses)
          .set({
            ...fields,
            ...(nextCurrency === 'UGX' ? { exchangeRate: null } : {}),
          })
          .where(eq(supplyRouteExpenses.id, id))
          .returning()
      ).at(0)

      if (!expense) throw new Error('Expense not found')
      await postRouteExpenseJournal(tx, {
        ...expense,
        storeId: store.id,
        recordedBy: session.user.id,
      })
      return expense
    })
  })

const deleteExpenseInput = z.object({ id: z.uuid() })

export const deleteSupplyRouteExpense = createServerFn()
  .inputValidator(deleteExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin'])

    await db.transaction(async (tx) => {
      const existing = await tx.query.supplyRouteExpenses.findFirst({
        where: eq(supplyRouteExpenses.id, data.id),
        with: { supplyRoute: true },
      })
      if (!existing) throw new Error('Expense not found')
      if (existing.supplyRoute.status !== 'open')
        throw new Error('Only open routes can be edited')

      await reverseRouteExpenseJournal(tx, data.id, session.user.id)
      await tx
        .delete(supplyRouteExpenses)
        .where(eq(supplyRouteExpenses.id, data.id))
    })
  })
