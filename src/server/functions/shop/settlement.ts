import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { db } from "#/db"
import { postJournalEntry } from "#/lib/accounting/ledger"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const settleInput = z.object({
  shopId: z.string().uuid(),
  amount: z.string(),
  paymentMethod: z.enum(["cash", "bank"]),
  bankAccountId: z.string().uuid().optional(),
  description: z.string().optional(),
})

/**
 * Settle inter-branch balance — shop pays the store.
 *
 * Ledger entries:
 *   DR Cash/Bank (Store)   / CR Due from Shop
 *   DR Due to Store        / CR Cash/Bank (Shop)
 */
export const settleInterBranch = createServerFn()
  .inputValidator(settleInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const userId = (session.user as { id: string }).id

    const store = await db.query.stores.findFirst()
    if (!store) throw new Error("Store not configured")

    return db.transaction(async (tx) => {
      const depositCat = data.paymentMethod === "cash" ? "Cash" : "Bank"

      // Store side: receive payment
      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: depositCat, amount: data.amount },
          { type: "credit", category: "Due from Shop", amount: data.amount },
        ],
        referenceType: "settlement",
        referenceId: data.shopId,
        locationType: "store",
        locationId: store.id,
        depositLocation: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: data.description ?? "Inter-branch settlement from shop",
      })

      // Shop side: make payment
      await postJournalEntry(tx, {
        entries: [
          { type: "debit", category: "Due to Store", amount: data.amount },
          { type: "credit", category: depositCat, amount: data.amount },
        ],
        referenceType: "settlement",
        referenceId: store.id,
        locationType: "shop",
        locationId: data.shopId,
        depositLocation: data.paymentMethod,
        bankAccountId: data.bankAccountId,
        recordedBy: userId,
        description: data.description ?? "Inter-branch settlement to store",
      })

      return { settled: true }
    })
  })
