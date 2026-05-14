import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import BigNumber from "bignumber.js"
import { db } from "#/db"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const transferFundsInput = z.object({
  /** Direction of the transfer. */
  direction: z.enum(["cash_to_bank", "bank_to_cash"]),
  amount: z
    .string()
    .refine((v) => new BigNumber(v).gt(0), "Amount must be positive"),
  bankAccountId: z.uuid(),
  locationType: z.enum(["store", "shop"]),
  locationId: z.uuid(),
  description: z.string().optional(),
})

/**
 * Transfer funds between cash and bank (Section 5.7).
 *
 * Depositing cash to bank:  DR Bank  / CR Cash
 * Withdrawing from bank:    DR Cash  / CR Bank
 */
export const transferFunds = createServerFn()
  .inputValidator(transferFundsInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = session.user.id

    const debitCategory =
      data.direction === "cash_to_bank" ? "Bank" : "Cash"
    const creditCategory =
      data.direction === "cash_to_bank" ? "Cash" : "Bank"

    return db.transaction(async (tx) => {
      const journalGroupId = await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: debitCategory, amount: data.amount },
          { type: "credit", category: creditCategory, amount: data.amount },
        ],
        referenceType: "fund_transfer",
        referenceId: data.bankAccountId,
        locationType: data.locationType,
        locationId: data.locationId,
        depositLocation: data.direction === "cash_to_bank" ? "bank" : "cash",
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description:
          data.description ??
          (data.direction === "cash_to_bank"
            ? "Deposit cash to bank"
            : "Withdraw from bank to cash"),
      })

      return { journalGroupId }
    })
  })
