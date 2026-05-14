import { createServerFn } from "@tanstack/react-start"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { locationExpenses } from "#/db/schema"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listLocationExpenses = createServerFn()
  .inputValidator(
    z.object({
      locationType: z.enum(["store", "shop"]),
      locationId: z.uuid(),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    return db.query.locationExpenses.findMany({
      where: and(
        eq(locationExpenses.locationType, data.locationType),
        eq(locationExpenses.locationId, data.locationId),
      ),
      orderBy: (e, { desc }) => [desc(e.expenseDate)],
    })
  })

const addExpenseInput = z.object({
  locationType: z.enum(["store", "shop"]),
  locationId: z.uuid(),
  category: z.string().min(1),
  description: z.string().optional(),
  amount: z.string().refine((v) => new BigNumber(v).gt(0), "Amount must be positive"),
  expenseDate: z.string(),
  paymentMethod: z.enum(["cash", "bank"]),
  bankAccountId: z.uuid().optional(),
})

/**
 * Record a location operating expense.
 * Posts ledger: DR [Expense Category] / CR Cash or Bank
 */
export const addLocationExpense = createServerFn()
  .inputValidator(addExpenseInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    return db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(locationExpenses)
        .values({ ...data, recordedBy: userId })
        .returning()

      // Map common category names to ledger categories
      const categoryMap: Record<string, string> = {
        rent: "Rent Expense",
        salary: "Salary Expense",
        wages: "Salary Expense",
        tax: "Tax Expense",
        transport: "Transportation Expense",
        utilities: "Miscellaneous Expense",
      }
      const ledgerCategory =
        categoryMap[data.category.toLowerCase()] ?? "Miscellaneous Expense"
      const depositCat = data.paymentMethod === "cash" ? "Cash" : "Bank"

      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: ledgerCategory, amount: data.amount },
          { type: "credit", category: depositCat, amount: data.amount },
        ],
        referenceType: "expense",
        referenceId: expense.id,
        locationType: data.locationType,
        locationId: data.locationId,
        depositLocation: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: `${data.category}: ${data.description ?? ""}`,
      })

      return expense
    })
  })
