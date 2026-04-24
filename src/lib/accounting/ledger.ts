import { eq } from "drizzle-orm"
import BigNumber from "bignumber.js"
import { transactions, transactionCategories } from "#/db/schema"
import type { Database } from "#/db"

interface JournalEntry {
  type: "debit" | "credit"
  category: string
  amount: string // BigNumber string
}

export interface PostJournalParams {
  entries: JournalEntry[]
  referenceType: string
  referenceId: string
  locationType: "store" | "shop"
  locationId: string
  depositLocation?: "cash" | "bank"
  bankAccountId?: string
  recordedBy: string
  transactionDate?: Date
  description?: string
}

/**
 * Post a balanced journal entry to the ledger.
 *
 * All entries in a journal group share the same journalGroupId.
 * Total debits must equal total credits or the entry is rejected.
 */
export async function postJournalEntry(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  params: PostJournalParams,
): Promise<string> {
  const journalGroupId = crypto.randomUUID()

  // Validate balance
  const totalDebits = params.entries
    .filter((e) => e.type === "debit")
    .reduce((sum, e) => sum.plus(e.amount), new BigNumber(0))

  const totalCredits = params.entries
    .filter((e) => e.type === "credit")
    .reduce((sum, e) => sum.plus(e.amount), new BigNumber(0))

  if (!totalDebits.eq(totalCredits)) {
    throw new Error(
      `Journal entry unbalanced: DR ${totalDebits.toFixed(2)} != CR ${totalCredits.toFixed(2)}`,
    )
  }

  if (totalDebits.isZero()) {
    throw new Error("Journal entry cannot have zero amount")
  }

  // Resolve categories and insert entries
  for (const entry of params.entries) {
    const categoryId = await resolveCategory(tx, entry.category)

    await tx.insert(transactions).values({
      type: entry.type,
      amount: entry.amount,
      categoryId,
      journalGroupId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      locationType: params.locationType,
      locationId: params.locationId,
      depositLocation: params.depositLocation,
      bankAccountId: params.bankAccountId,
      recordedBy: params.recordedBy,
      transactionDate: params.transactionDate ?? new Date(),
      description: params.description,
    })
  }

  return journalGroupId
}

/**
 * Resolve a category name to its ID. Throws if not found.
 */
async function resolveCategory(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  name: string,
): Promise<string> {
  const rows = await tx
    .select({ id: transactionCategories.id })
    .from(transactionCategories)
    .where(eq(transactionCategories.name, name))
    .limit(1)

  if (rows.length === 0) {
    throw new Error(`Transaction category not found: "${name}"`)
  }

  return rows[0].id
}
