import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { supplyRouteExpenses, supplyRoutes } from '#/db/schema'
import { postJournalEntry } from '#/lib/accounting/ledger'
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

const addExpenseInput = z.object({
  supplyRouteId: z.uuid(),
  category: z.enum([
    'freight',
    'shipping',
    'customs',
    'ticket',
    'transportation',
    'insurance',
    'rent',
    'salary',
    'tax',
    'miscellaneous',
  ]),
  description: z.string().optional(),
  amount: z.string(),
  currency: z.string().default('UGX'),
  exchangeRate: z.string().optional(),
})

export const addSupplyRouteExpense = createServerFn()
  .inputValidator(addExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSessionAndRole(['admin'])
    const userId = session.user.id

    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, data.supplyRouteId),
    })
    if (!route) throw new Error('Supply route not found')
    if (route.status !== 'open') throw new Error('Only open routes can be edited')

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error('Store not configured')

    return db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(supplyRouteExpenses)
        .values(data)
        .returning()

      const ledgerCategory =
        expenseCategoryToLedger[data.category] ?? 'Miscellaneous Expense'
      const amountUgx = convertExpenseToUgx(data)

      await postJournalEntry(tx, {
        entries: [
          { type: 'debit', category: ledgerCategory, amount: amountUgx },
          { type: 'credit', category: 'Cash', amount: amountUgx },
        ],
        referenceType: 'supply_route',
        referenceId: expense.id,
        locationType: 'store',
        locationId: store.id,
        depositLocation: 'cash',
        recordedBy: userId,
        description: `${data.category}: ${data.description ?? ''}`,
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
      'rent',
      'salary',
      'tax',
      'miscellaneous',
    ])
    .optional(),
  description: z.string().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  exchangeRate: z.string().optional(),
})

export const updateSupplyRouteExpense = createServerFn()
  .inputValidator(updateExpenseInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const { id, ...fields } = data
    const existing = await db.query.supplyRouteExpenses.findFirst({
      where: eq(supplyRouteExpenses.id, id),
      with: { supplyRoute: true },
    })
    if (!existing) throw new Error('Expense not found')
    if (existing.supplyRoute.status !== 'open')
      throw new Error('Only open routes can be edited')
    const expense = (
      await db
        .update(supplyRouteExpenses)
        .set(fields)
        .where(eq(supplyRouteExpenses.id, id))
        .returning()
    ).at(0)

    if (!expense) throw new Error('Expense not found')
    return expense
  })

const deleteExpenseInput = z.object({ id: z.uuid() })

export const deleteSupplyRouteExpense = createServerFn()
  .inputValidator(deleteExpenseInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const existing = await db.query.supplyRouteExpenses.findFirst({
      where: eq(supplyRouteExpenses.id, data.id),
      with: { supplyRoute: true },
    })
    if (!existing) throw new Error('Expense not found')
    if (existing.supplyRoute.status !== 'open')
      throw new Error('Only open routes can be edited')

    await db
      .delete(supplyRouteExpenses)
      .where(eq(supplyRouteExpenses.id, data.id))
  })
