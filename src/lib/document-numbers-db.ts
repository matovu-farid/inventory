import { sql } from 'drizzle-orm'
import type { Tx } from '#/db'
import { documentNumbers } from '#/db/schema'
import { formatDocumentNumber } from './document-numbers'
import type { DocumentPrefix } from './document-numbers'

const DEFAULT_PADDING: Record<DocumentPrefix, number> = {
  SR: 4,
  RCV: 4,
  TRF: 4,
  SALE: 5,
  PAY: 4,
  RET: 4,
  'STR-RET': 4,
  STK: 4,
}

/**
 * Issue the next document number for a given prefix in the given year.
 *
 * Uses an INSERT ... ON CONFLICT ... RETURNING to atomically increment
 * the per-prefix counter. The returned `issued` value is the number that
 * will be used for the formatted document number.
 *
 * Numbers reset annually. Sequences are advisory: a rolled-back transaction
 * does not consume a number — the canonical number is read back from the
 * row that wrote it.
 */
export async function nextDocumentNumber(
  tx: Tx,
  prefix: DocumentPrefix,
  year: number = new Date().getFullYear(),
): Promise<{ number: number; formatted: string }> {
  const rows = await tx.execute<{ issued: number }>(sql`
    INSERT INTO ${documentNumbers} (prefix, year, next)
    VALUES (${prefix}, ${year}, 2)
    ON CONFLICT (prefix, year) DO UPDATE
      SET next = ${documentNumbers}.next + 1
    RETURNING ${documentNumbers}.next - 1 AS issued
  `)

  const issued = Number(rows.rows[0].issued)
  const pad = DEFAULT_PADDING[prefix]
  return {
    number: issued,
    formatted: formatDocumentNumber(prefix, year, issued, pad),
  }
}
