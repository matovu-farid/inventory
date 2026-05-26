import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { db } from '../src/db'

/**
 * Backfill the `variants` table from existing `items` × `item_colors`.
 *
 * Spec: docs/superpowers/specs/2026-05-24-category-item-variant-design.md
 *       §4 step 4.
 *
 * Pre-flight assertion (rolls the whole transaction back if non-zero):
 *
 *   - No item may have duplicate sizes in `items.sizes`. The schema
 *     allows it (Postgres text[] is not a set), but it would let us insert
 *     duplicates with `unnest` and would violate the unique
 *     (item_id, color_id, size) constraint anyway.
 *
 * Backfill itself uses `INSERT … SELECT DISTINCT … ON CONFLICT DO NOTHING`
 * so re-running the script is a no-op.
 *
 * Historical note: an earlier version also asserted that every
 * (product_color_id, size) row in `store_stock` / `shop_stock` mapped to a
 * size in `items.sizes`. Issue #4 dropped those composite columns from both
 * stock tables in favour of `variant_id`, so the orphan check is no longer
 * runnable (the columns it scanned no longer exist). The orphan-count
 * fields on `BackfillSummary` are kept for backwards compatibility and
 * always report 0.
 */
export interface BackfillSummary {
  inserted: number
  skipped: number
  assertions: {
    storeStockOrphans: number
    shopStockOrphans: number
    productsWithDuplicateSizes: number
  }
}

export interface BackfillOptions {
  /**
   * Restrict pre-flight assertions and backfill to a specific set of
   * product (a.k.a. "item") IDs. Used by the test suite to avoid being
   * tripped up by transient rows that parallel test files write to the
   * same `inventory_test` database. Production callers (the
   * `backfill:variants` package script) leave this undefined so assertions
   * run against the entire catalog.
   */
  itemIds?: string[]
}

// Stock + notification tables both used to live here; #4 swapped stock onto
// `variant_id` and #5 did the same for notifications. Neither carries the
// composite key any more, so the orphan check has no rows to scan.

function normaliseRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows?: T[] }).rows ?? []
}

function itemFilterClause(itemIds: string[] | undefined) {
  if (!itemIds || itemIds.length === 0) return sql``
  return sql` AND p.id IN (${sql.join(
    itemIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`
}

// Historical: prior to #4, this scanned shop_stock / store_stock for rows
// whose (product_color_id, size) did not match items.sizes. Once #4 dropped
// those columns, there is nothing left to scan, so the function is a no-op
// kept for shape-compatibility with `BackfillSummary.assertions.*Orphans`.

export async function backfillVariants(
  options: BackfillOptions = {},
): Promise<BackfillSummary> {
  const { itemIds } = options

  return db.transaction(async (tx) => {
    // No product may carry duplicate sizes in its sizes[] array.
    // COALESCE handles the sizes=[] case (array_length returns NULL while
    // COUNT(DISTINCT …) returns 0 — without coalesce, every empty array
    // would be mis-flagged as a duplicate).
    const dupResult = await tx.execute<{ dups: number }>(sql`
      SELECT COUNT(*)::int AS dups
      FROM (
        SELECT 1
        FROM items p
        WHERE COALESCE(array_length(p.sizes, 1), 0) <> (
          SELECT COUNT(DISTINCT s)::int FROM unnest(p.sizes) AS s
        )${itemFilterClause(itemIds)}
      ) AS x
    `)
    const dupRows = normaliseRows<{ dups: number }>(dupResult)
    const productsWithDuplicateSizes = dupRows[0]?.dups ?? 0
    if (productsWithDuplicateSizes > 0) {
      throw new Error(
        `backfill aborted: ${productsWithDuplicateSizes} item(s) have duplicate entries in items.sizes — deduplicate before continuing.`,
      )
    }

    // 3. Backfill. DISTINCT guards against duplicates even if assertion #2
    //    is ever bypassed; ON CONFLICT DO NOTHING makes the script
    //    idempotent on re-runs and on already-backfilled rows.
    const insertResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO variants (item_id, color_id, size)
      SELECT DISTINCT pc.item_id, pc.id, sz
      FROM item_colors pc
      JOIN items p ON p.id = pc.item_id
      CROSS JOIN LATERAL unnest(p.sizes) AS sz
      WHERE TRUE${itemFilterClause(itemIds)}
      ON CONFLICT ON CONSTRAINT uq_variant_item_color_size DO NOTHING
      RETURNING id
    `)
    const insertedRows = normaliseRows<{ id: string }>(insertResult)
    const inserted = insertedRows.length

    // Total candidate (color, size) pairs in the (filtered) catalog —
    // useful for idempotency assertions and human-readable logging.
    const candResult = await tx.execute<{ c: number }>(sql`
      SELECT COUNT(*)::int AS c
      FROM (
        SELECT DISTINCT pc.item_id, pc.id, sz
        FROM item_colors pc
        JOIN items p ON p.id = pc.item_id
        CROSS JOIN LATERAL unnest(p.sizes) AS sz
        WHERE TRUE${itemFilterClause(itemIds)}
      ) AS x
    `)
    const candRows = normaliseRows<{ c: number }>(candResult)
    const totalCandidates = candRows[0]?.c ?? 0

    return {
      inserted,
      skipped: Math.max(totalCandidates - inserted, 0),
      assertions: {
        storeStockOrphans: 0,
        shopStockOrphans: 0,
        productsWithDuplicateSizes,
      },
    }
  })
}

async function main(): Promise<void> {
  console.log('Backfilling variants from item_colors × items.sizes...')
  const summary = await backfillVariants()
  console.log('Assertions:', summary.assertions)
  console.log(
    `Done. Inserted ${summary.inserted} variant(s); ${summary.skipped} pre-existing row(s) left untouched.`,
  )
}

// Run main() only when executed directly via `pnpm backfill:variants`,
// not when imported from the Vitest suite.
const invokedDirectly = (() => {
  const arg1 = process.argv[1]
  if (!arg1) return false
  // tsx resolves the entry to an absolute file path; compare basenames so
  // both `tsx scripts/backfill-variants.ts` and absolute paths match.
  return (
    arg1.endsWith('backfill-variants.ts') ||
    arg1.endsWith('backfill-variants.js') ||
    arg1.endsWith('backfill-variants')
  )
})()

if (invokedDirectly) {
  void main()
    .catch((err: unknown) => {
      console.error('Backfill failed:', err)
      process.exit(1)
    })
    .then(() => process.exit(0))
}
