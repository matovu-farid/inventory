/**
 * Shared cleanup for E2E and integration tests.
 *
 * Extracted from `cypress.config.ts` so the same code path can be
 * exercised from vitest (integration tests against the test DB) and from
 * the cypress `cleanupAllTestData` task.
 *
 * Uses `TRUNCATE ... CASCADE` instead of sequential `DELETE` to avoid a
 * race condition (#12): a concurrent server-side transaction that commits
 * AFTER a child-table `DELETE` but BEFORE the matching parent-table
 * `DELETE` re-introduces a child row referencing a parent we're about to
 * remove, and the parent `DELETE` fails with an FK violation.
 *
 * `TRUNCATE` takes ACCESS EXCLUSIVE on every affected table at the start,
 * blocking concurrent inserts from being visible.
 */

import type { Client, PoolClient } from 'pg'

export async function cleanupAllTestData(
  client: Client | PoolClient,
): Promise<void> {
  await client.query(
    `TRUNCATE TABLE customer_payment_applications,
       customer_payments,
       shop_return_lines,
       shop_returns,
       store_return_lines,
       store_returns,
       transactions,
       stock_take_lines,
       stock_takes,
       shop_sale_lines,
       shop_sales,
       location_expenses,
       shop_stock,
       store_transfer_lines,
       store_transfers,
       store_receivings,
       store_stock,
       supply_route_expenses,
       supply_route_lines,
       supply_route_suppliers,
       supply_routes,
       suppliers,
       customers,
       shift_closures,
       low_stock_alerts,
       restock_requisitions,
       notification_threshold_overrides,
       notification_thresholds,
       picture_upload_tokens,
       admin_ip_allowlist,
       shops,
       stores,
       notifications,
       audit_logs,
       idempotency_keys,
       document_numbers,
       session,
       account,
       verification,
       "user",
       variants,
       item_colors,
       items
     RESTART IDENTITY CASCADE`,
  )
}
