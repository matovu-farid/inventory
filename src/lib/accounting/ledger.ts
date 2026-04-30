import { eq, isNotNull, and } from "drizzle-orm"
import BigNumber from "bignumber.js"
import { transactions, transactionCategories } from "#/db/schema"
import type { Database } from "#/db"
import { buildReversalEntries, assertReversible } from "./reversal"

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
 * Reverse a previously posted journal group.
 *
 * Creates a new journal group whose legs flip the originals' debit/credit type,
 * preserving amounts and categories. Links the two groups bidirectionally via
 * reversesJournalGroupId / reversedByJournalGroupId. Refuses to reverse a group
 * that has already been reversed.
 */
export async function reverseJournalEntry(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  originalJournalGroupId: string,
  params: { reason: string; recordedBy: string },
): Promise<string> {
  // SELECT ... FOR UPDATE to lock the original group's rows for the
  // duration of this transaction. Closes the TOCTOU race where two
  // concurrent reverseJournalEntry calls could both pass the
  // already-reversed guard.
  const original = await tx
    .select()
    .from(transactions)
    .where(eq(transactions.journalGroupId, originalJournalGroupId))
    .for("update")

  assertReversible(original)

  const reversalGroupId = crypto.randomUUID()
  const reversalEntries = buildReversalEntries(
    original.map((e) => ({
      type: e.type,
      amount: e.amount,
      categoryId: e.categoryId,
      locationType: e.locationType,
      locationId: e.locationId,
      bankAccountId: e.bankAccountId,
      depositLocation: e.depositLocation,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      description: e.description,
    })),
    params,
  )

  for (const entry of reversalEntries) {
    await tx.insert(transactions).values({
      type: entry.type,
      amount: entry.amount,
      categoryId: entry.categoryId,
      journalGroupId: reversalGroupId,
      reversesJournalGroupId: originalJournalGroupId,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      locationType: entry.locationType,
      locationId: entry.locationId,
      depositLocation: entry.depositLocation,
      bankAccountId: entry.bankAccountId,
      recordedBy: entry.recordedBy,
      transactionDate: new Date(),
      description: entry.description,
    })
  }

  await tx
    .update(transactions)
    .set({ reversedByJournalGroupId: reversalGroupId })
    .where(
      and(
        eq(transactions.journalGroupId, originalJournalGroupId),
        isNotNull(transactions.id),
      ),
    )

  return reversalGroupId
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
