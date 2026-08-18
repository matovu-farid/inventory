import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'

import { cleanupAllTestData } from '../../cypress/support/cleanup'

/**
 * Regression test for #12: cypress E2E cleanup fails with an FK violation
 * on `store_stock` when a concurrent server-side transaction inserts into
 * `store_transfer_lines` mid-cleanup.
 *
 * The original CI failure (run 26387940736, job 77670608351) happened in
 * the "Low-stock restock flow" spec's "after all" hook: the third `it`
 * block clicked "Create transfer", which fires a server mutation that
 * INSERTs into `store_transfers` + `store_transfer_lines`. The hook's
 * `cy.task("cleanupAllTestData", null)` ran while the dev server was
 * still committing that transaction, producing this interleaving:
 *
 *   server tx B:                        cypress cleanup A:
 *   ─────────────────────────           ─────────────────────────
 *   BEGIN
 *   INSERT store_transfer_lines
 *     (store_stock_id = S)              DELETE FROM store_transfer_lines
 *                                         (sees no rows — B uncommitted)
 *                                       ... other deletes ...
 *                                       DELETE FROM store_stock
 *                                         (blocks on B's KEY SHARE on S)
 *   COMMIT
 *                                       (resumes — FK trigger now sees
 *                                        B's just-committed row,
 *                                        throws "violates foreign key
 *                                        constraint" on store_stock.)
 *
 * This test reproduces the interleaving deterministically by polling
 * `pg_stat_activity` for A's blocked state before committing B. With the
 * pre-fix sequential `DELETE` cleanup the test FAILS with an FK
 * violation; with the post-fix `TRUNCATE ... CASCADE` cleanup it passes
 * because TRUNCATE takes ACCESS EXCLUSIVE on every affected table at the
 * start, blocking B's uncommitted INSERT visibility from being relevant.
 */

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL || !/test/i.test(DATABASE_URL)) {
  throw new Error(
    'cleanup-fk.test.ts refuses to run: DATABASE_URL must point at a test ' +
      'database. Run via `pnpm test` (which loads .env.test).',
  )
}

async function withClient<T>(
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Polls pg_stat_activity until the given backend pid is waiting on a
 * lock (state = 'active' and wait_event_type = 'Lock'). Times out after
 * `timeoutMs`.
 */
async function waitForBlocked(
  observer: pg.Client,
  pid: number,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now()
  for (;;) {
    const res = await observer.query<{
      state: string | null
      wait_event_type: string | null
      query: string | null
    }>(
      `SELECT state, wait_event_type, query
       FROM pg_stat_activity
       WHERE pid = $1`,
      [pid],
    )
    const row = res.rows.at(0)
    if (row?.state === 'active' && row.wait_event_type === 'Lock') {
      return
    }
    if (Date.now() - start > timeoutMs) {
      const state = row?.state ?? 'n/a'
      const waitType = row?.wait_event_type ?? 'n/a'
      const lastQuery = row?.query?.slice(0, 200) ?? 'n/a'
      throw new Error(
        `Timed out waiting for pid ${pid} to block on a lock; last state=${state} wait_event_type=${waitType} query=${lastQuery}`,
      )
    }
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function seedParentRow(client: pg.Client): Promise<string> {
  // Walk the FK chain: item → item_color → variant → store_stock.
  // All target rows must be committed before the concurrent insert begins.
  const item = await client.query<{ id: string }>(
    `INSERT INTO items (name, design)
     VALUES ('Cleanup FK Test', 'Test')
     RETURNING id`,
  )
  const itemId = item.rows[0].id
  await client.query(
    `INSERT INTO item_article_numbers (item_id, article_number)
     VALUES ($1, 'CFK-' || extract(epoch from now())::text)`,
    [itemId],
  )

  const color = await client.query<{ id: string }>(
    `INSERT INTO item_colors (item_id, color_name, color_hex)
     VALUES ($1, 'Red', '#FF0000')
     RETURNING id`,
    [itemId],
  )
  const colorId = color.rows[0].id

  const variant = await client.query<{ id: string }>(
    `INSERT INTO variants (item_id, color_id, size)
     VALUES ($1, $2, 'M')
     RETURNING id`,
    [itemId, colorId],
  )
  const variantId = variant.rows[0].id

  const store = await client.query<{ id: string }>(
    `INSERT INTO stores (name) VALUES ('CFK Store') RETURNING id`,
  )
  const storeId = store.rows[0].id

  const ss = await client.query<{ id: string }>(
    `INSERT INTO store_stock (store_id, item_id, variant_id, quantity_on_hand,
                              cost_per_unit_ugx)
     VALUES ($1, $2, $3, 10, 1000)
     RETURNING id`,
    [storeId, itemId, variantId],
  )
  return ss.rows[0].id
}

async function fullCleanup(client: pg.Client): Promise<void> {
  // Final cleanup at the end of the spec; bypass the function under test
  // so a regression in it doesn't leak rows into subsequent specs.
  await client.query(
    `TRUNCATE TABLE stores, shops, suppliers, customers, supply_routes,
       stock_takes, shop_sales, shop_returns, store_returns,
       store_transfers, store_stock, shop_stock, transactions,
       shift_closures, notification_thresholds, low_stock_alerts,
       restock_requisitions, notifications, audit_logs, idempotency_keys,
       document_numbers, session, account, verification, "user",
       variants, item_colors, item_article_numbers, items
     RESTART IDENTITY CASCADE`,
  )
}

describe('cleanupAllTestData — race safety vs concurrent FK referrer', () => {
  beforeEach(async () => {
    await withClient(fullCleanup)
  })
  afterEach(async () => {
    await withClient(fullCleanup)
  })

  it('completes without an FK violation when a concurrent transaction commits a store_transfer_lines row mid-cleanup', async () => {
    // Seed S in store_stock. Both `shops` (target of the eventual
    // transfer) and `stores` are committed before the concurrent
    // insert begins so B can reference them inside its transaction.
    const setup = new pg.Client({ connectionString: DATABASE_URL })
    await setup.connect()
    const storeStockId = await seedParentRow(setup)
    const shop = await setup.query<{ id: string }>(
      `INSERT INTO shops (name) VALUES ('CFK Shop') RETURNING id`,
    )
    const shopId = shop.rows[0].id
    const storeRes = await setup.query<{ id: string; item_id: string }>(
      `SELECT store_id AS id, item_id FROM store_stock WHERE id = $1`,
      [storeStockId],
    )
    const storeId = storeRes.rows[0].id
    const itemId = storeRes.rows[0].item_id
    await setup.end()

    // Two long-lived clients on independent connections.
    const clientA = new pg.Client({ connectionString: DATABASE_URL })
    const clientB = new pg.Client({ connectionString: DATABASE_URL })
    const observer = new pg.Client({ connectionString: DATABASE_URL })
    await Promise.all([
      clientA.connect(),
      clientB.connect(),
      observer.connect(),
    ])

    const aPidRes = await clientA.query<{ pid: number }>(
      `SELECT pg_backend_pid() AS pid`,
    )
    const aPid = aPidRes.rows[0].pid

    try {
      // B opens a transaction mimicking the server's `createTransfer`
      // mutation: insert the transfer header AND a line referencing S
      // in the same transaction. Neither row is visible to A until B
      // commits. The line INSERT takes a KEY SHARE lock on
      // store_stock.S to keep S alive for the duration of B's tx.
      await clientB.query('BEGIN')
      const transferRes = await clientB.query<{ id: string }>(
        `INSERT INTO store_transfers
             (store_id, shop_id, transfer_date, status)
           VALUES ($1, $2, now(), 'dispatched')
           RETURNING id`,
        [storeId, shopId],
      )
      const transferId = transferRes.rows[0].id
      await clientB.query(
        `INSERT INTO store_transfer_lines
             (store_transfer_id, store_stock_id, item_id, quantity_dispatched,
              unit_price_ugx, total_price_ugx)
           VALUES ($1, $2, $3, 1, 1000, 1000)`,
        [transferId, storeStockId, itemId],
      )

      // A starts the cleanup. With the pre-fix sequential DELETE, A
      // proceeds through the early statements (B's row is uncommitted
      // and invisible) and blocks at `DELETE FROM store_stock` on B's
      // KEY SHARE lock. With the post-fix TRUNCATE … CASCADE, A blocks
      // at the very first statement waiting for ACCESS EXCLUSIVE.
      // Either way, A blocks until B commits.
      const cleanupPromise = cleanupAllTestData(clientA).catch((err: Error) => {
        // Surface the FK violation via the awaited promise below.
        throw err
      })
      // Wait until A is observed waiting on a lock — guarantees B's
      // commit happens AFTER A has reached its blocked step rather
      // than racing it.
      await waitForBlocked(observer, aPid)
      // Snapshot what A is waiting on, for diagnostics if the assert
      // below fires unexpectedly.
      const blockedInfo = await observer.query<{
        query: string | null
        wait_event: string | null
      }>(`SELECT query, wait_event FROM pg_stat_activity WHERE pid = $1`, [
        aPid,
      ])
      const bRow = blockedInfo.rows.at(0)
      if (!bRow) {
        throw new Error(`pg_stat_activity returned no row for pid ${aPid}`)
      }
      const bQuery = bRow.query?.slice(0, 200) ?? 'n/a'
      const bWait = bRow.wait_event ?? 'n/a'
      console.log('[cleanup-fk] A blocked at:', bQuery, 'wait_event:', bWait)
      await clientB.query('COMMIT')

      // With the pre-fix sequential cleanup this rejects with
      //   "update or delete on table \"store_stock\" violates foreign
      //    key constraint
      //    \"store_transfer_items_store_stock_id_store_stock_id_fk\""
      // With the post-fix TRUNCATE-CASCADE it resolves cleanly.
      await expect(cleanupPromise).resolves.toBeUndefined()

      // And of course, the tables should be empty afterwards.
      const stockCount = await observer.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM store_stock`,
      )
      expect(stockCount.rows[0].count).toBe('0')
      const lineCount = await observer.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM store_transfer_lines`,
      )
      expect(lineCount.rows[0].count).toBe('0')
    } finally {
      // If B is still in a tx (e.g. an earlier expect threw before
      // COMMIT), roll it back so the connection releases its locks.
      // why: ROLLBACK fails harmlessly when B already committed in
      // the happy path; the only reason to call it is to recover from
      // a test-assert failure, so we silence the no-op rejection
      // rather than mask a real teardown bug.
      try {
        await clientB.query('ROLLBACK')
      } catch {
        // expected when B already committed above
      }
      await Promise.all([clientA.end(), clientB.end(), observer.end()])
    }
  }, 15_000)
})
