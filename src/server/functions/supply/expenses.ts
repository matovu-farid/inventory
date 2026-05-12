import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { supplyRouteExpenses } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { convertExpenseToUgx } from "./expense-fx"

/** Map supply-route expense categories to ledger account names. */
const expenseCategoryToLedger: Record<string, string> = {
  freight: "Freight Expense",
  shipping: "Freight Expense",
  customs: "Customs Expense",
  ticket: "Travel Expense",
  transportation: "Transportation Expense",
  insurance: "Miscellaneous Expense",
  rent: "Rent Expense",
  salary: "Salary Expense",
  tax: "Tax Expense",
  miscellaneous: "Miscellaneous Expense",
}

const addExpenseInput = z.object({
  supplyRouteId: z.string().uuid(),
  category: z.enum([
    "freight",
    "shipping",
    "customs",
    "ticket",
    "transportation",
    "insurance",
    "rent",
    "salary",
    "tax",
    "miscellaneous",
  ]),
  description: z.string().optional(),
  amount: z.string(),
  currency: z.string().default("UGX"),
  exchangeRate: z.string().optional(),
})

export const addSupplyRouteExpense = createServerFn()
  .inputValidator(addExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const userId = (session.user as { id: string }).id

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(supplyRouteExpenses)
        .values(data)
        .returning()

      const ledgerCategory =
        expenseCategoryToLedger[data.category] ?? "Miscellaneous Expense"
      const amountUgx = convertExpenseToUgx(data)

      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: ledgerCategory, amount: amountUgx },
          { type: "credit", category: "Cash", amount: amountUgx },
        ],
        referenceType: "supply_route",
        referenceId: expense.id,
        locationType: "store",
        locationId: store.id,
        depositLocation: "cash",
        recordedBy: userId,
        description: `${data.category}: ${data.description ?? ""}`,
      })

      return expense
    })
  })

const updateExpenseInput = z.object({
  id: z.string().uuid(),
  category: z
    .enum([
      "freight",
      "shipping",
      "customs",
      "ticket",
      "transportation",
      "insurance",
      "rent",
      "salary",
      "tax",
      "miscellaneous",
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
    const session = await requireSession()
    requireRole(session, ["admin"])

    const { id, ...fields } = data
    const expense = (await db
      .update(supplyRouteExpenses)
      .set(fields)
      .where(eq(supplyRouteExpenses.id, id))
      .returning()).at(0)

    if (!expense) throw new Error("Expense not found")
    return expense
  })

const deleteExpenseInput = z.object({ id: z.string().uuid() })

export const deleteSupplyRouteExpense = createServerFn()
  .inputValidator(deleteExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    await db
      .delete(supplyRouteExpenses)
      .where(eq(supplyRouteExpenses.id, data.id))
  })
