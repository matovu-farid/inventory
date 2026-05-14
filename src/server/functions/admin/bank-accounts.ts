import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { bankAccounts } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

// ── List bank accounts ───────────────────────────────────────────

export const listBankAccounts = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  return db.select().from(bankAccounts).orderBy(bankAccounts.bankName)
})

// ── Create bank account ──────────────────────────────────────────

const createBankAccountInput = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  accountName: z.string().min(1),
  notes: z.string().optional(),
})

export const createBankAccount = createServerFn()
  .inputValidator(createBankAccountInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const [account] = await db.insert(bankAccounts).values(data).returning()
    return account
  })

// ── Update bank account ──────────────────────────────────────────

const updateBankAccountInput = z.object({
  id: z.uuid(),
  bankName: z.string().min(1).optional(),
  accountNumber: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
})

export const updateBankAccount = createServerFn()
  .inputValidator(updateBankAccountInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const { id, ...fields } = data
    const account = (await db
      .update(bankAccounts)
      .set(fields)
      .where(eq(bankAccounts.id, id))
      .returning()).at(0)
    if (!account) throw new Error("Bank account not found")
    return account
  })
