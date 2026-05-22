# Backdated Receipts & Enriched Audit Log — Design

**Date:** 2026-05-22
**Status:** Draft (awaiting user review)

## Background

The client raised five related requests during review:

1. Show the dates when goods were bought, received, and transferred.
2. Allow backdating these events.
3. Track who performed each activity.
4. Have a proper audit log for the system.
5. Filter the audit log by article number.
6. Have English explanations for activities.

Most of the infrastructure already exists in the codebase:

- Domain dates: `supply_routes.departureDate/returnDate`, `store_transfers.transferDate`, `shop_sales.saleDate`, `store_returns.returnDate`.
- "Who" tracking: `shop_sales.soldBy/approvedBy`, `store_transfers.dispatchedBy/receivedBy`, `store_receivings.receivedBy`.
- `audit_logs` table with `actor_user_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `metadata`, `ip_address`, `user_agent`, `created_at`.
- ~15 action codes already emitted from server functions.
- Ledger (`transactions`) already stores both `transactionDate` (business date) and `createdAt` (posted-at), plus `recordedBy`.

Gaps:

- `store_receivings.receivedDate` is hard-coded to `new Date()` — no backdating.
- No UI to view, filter, or search the audit log; no article-number filter mechanism.
- Action codes are technical strings (`stockTake.reconcile`); no English explanation anywhere.
- `audit_logs` rows don't carry article-number references, so filtering by article requires expensive cross-table joins or fragile `metadata` lookups.

## Scope

In scope for v1:

- Backdating for **store receiving only** (`store_receivings.receivedDate`).
- Audit log enrichment: stored English description, GIN-indexed article-number array, business-date column.
- Admin-only `/settings/audit-log` page with filters (article number, actor, action, date range).
- Per-article "Activity" panel on the product detail page (admin + supervisor).

Out of scope (explicitly deferred):

- Backdating for transfers, sales, returns, customer payments.
- Accounting period close / lock dates.
- Audit log CSV/PDF export.
- Supervisor-scoped global audit view.

## Design decisions

| # | Decision | Alternative considered |
|---|---|---|
| 1 | Backdate **receiving only** | Receiving + transfers + sales + returns (deferred to later milestone) |
| 2 | Bound receipt date to `[supply_route.departureDate, today]`; only admins can change from today | No bounds; or role-gated thresholds |
| 3 | Admin-only `/settings/audit-log` + per-article "Activity" panel on product detail (admin + supervisor) | Supervisor-scoped global view (deferred) |
| 4 | Denormalized `article_numbers text[]` column on `audit_logs`, GIN-indexed | Query-time joins (slow, complex); join table (extra writes) |
| 5 | Pre-rendered `description` text column written at event time | Client-side action-code dictionary; render-time templating |
| 6 | Ledger entries post on the business date (`transactions.transactionDate`); already wired | Post on system date; closed-period gating |

## Database changes

One drizzle migration `0007_audit_log_enrichment.sql`:

| Column | Type | Notes |
|---|---|---|
| `description` | `text NOT NULL` | Pre-rendered English sentence. Includes business date + entry date when they differ. NOT NULL is enforced after the backfill step completes. |
| `article_numbers` | `text[] NOT NULL DEFAULT '{}'` | Article numbers touched by this event. |
| `business_date` | `timestamptz NULL` | The event's effective date when distinct from `created_at`. NULL means "same as `created_at`". |

Plus:

```sql
CREATE INDEX idx_audit_articles ON audit_logs USING GIN (article_numbers);
```

No other schema changes. `store_receivings.receivedDate`, `transactions.transactionDate`, and `transactions.createdAt` already model the accrual pattern.

## Backend changes

### Audit helper extension — `src/server/middleware/audit.ts`

`AuditEntryParams` gains three fields:

```ts
description: string         // required
articleNumbers: string[]    // required (empty array allowed)
businessDate?: Date | null  // optional; only set when ≠ createdAt
```

`buildAuditEntry` validates `description` is non-empty and `articleNumbers` is an array (may be empty). `recordAuditLog` passes the new fields through.

### Description renderer — `src/server/audit/descriptions.ts` (new)

A single function `renderAuditDescription(action, ctx)` returns the English sentence for an audit row. Each of the ~15 action codes has its own template. Examples:

- `store.receiveGoods` → `"Mary received 48 of CB-1234 (Black, M) on supply route 'Spring 2026'. Business date 2026-04-10, recorded 2026-05-22."`
- `transfer.create` → `"James dispatched 24 of CB-1234 (Black) from main warehouse to Kireka shop."`
- `sale.create` → `"Janet sold 2 of CB-1234 (Black, M) at Kireka shop for UGX 80,000 (cash)."`
- `stockTake.reconcile` → `"Mary reconciled stock take #42 at Kireka shop — 3 articles adjusted."`

The templates live in one file so the client can review wording in one place. The same function is used by the runtime path AND the backfill script.

### Receiving function — `src/server/functions/store/receiving.ts`

Input gains optional `receivedDate: Date | null`. Validation runs at the function boundary, before the transaction opens:

1. If absent → default `new Date()`.
2. If present and the calendar day differs from today's calendar day (compared in Africa/Kampala timezone), `requireRole(session, ["admin"])`. Non-admins are rejected with the message: `"Only admins can change the receipt date."`
3. If present, must satisfy `route.departureDate ≤ receivedDate ≤ now`. Rejected with specific messages:
   - Before `departureDate`: `"Receipt date can't be before goods left China (YYYY-MM-DD)."`
   - In the future: `"Receipt date can't be in the future."`

Date-equality semantics: compare calendar day in Africa/Kampala, not exact timestamp, so that a user picking "today" via a date picker (which produces midnight in some zone) is never accidentally treated as backdating.

Inside the transaction, the chosen date threads through three places:

- `store_receivings.receivedDate`
- The ledger helper's `transactionDate` argument (replacing the current `new Date()`)
- The audit entry's `businessDate`

### Call-site updates (audit-emitting functions)

The 10 server functions currently calling `recordAuditLog` get updated to pass `description` and `articleNumbers`. Most call sites already have the data in scope (sale items, transfer items, etc.) — the change is purely additive at the call boundary. `businessDate` is only passed by the receiving function in v1.

## UI

### Global audit log page — `src/routes/settings/audit-log.tsx`

Admin-only route. Server function `listAuditLog(filters, cursor)` returns paginated rows (cursor on `(created_at desc, id)`).

Filters (all optional, AND-combined):

- **Article number** — text input with autocomplete from `products.articleNumber`. Translates to `article_numbers @> ARRAY[input]`.
- **Actor** — user picker.
- **Action** — multi-select sourced from `descriptions.ts`, labelled with the English friendly name.
- **Date range** — applied to `COALESCE(business_date, created_at)` so that backdated events filter into the period they belong to.

Table columns: business date | recorded date | actor | description | (expand → before/after/metadata JSON). All headers carry InfoTips per the project policy.

### Per-article "Activity" panel — product detail page

A new section on the existing product detail route, visible to admin + supervisor. Calls `listAuditLogByArticle(articleNumber, cursor)`, which is `listAuditLog` with the article filter pre-applied. Chronological feed only — no filter controls.

Empty states: `"No recorded activity yet."`

The audit log is append-only. No edit or delete UI is exposed.

### Receiving form date picker

A date input appears above the per-item table, defaulted to today. Visible to all roles, disabled for non-admins (with tooltip: `"Only admins can change the receipt date."`). InfoTip on the field explains the bounds.

## Data flow — canonical example (backdated receipt)

Scenario: Mary (admin) opens the receiving form on 2026-05-22, picks supply route "Spring 2026", and records that 48 of CB-1234 (Black, M) arrived 2026-04-10.

1. Client sends `{ supplyRouteId, items, receivedDate: 2026-04-10 }`.
2. Boundary validation: admin check (date ≠ today), load route, assert `departureDate ≤ receivedDate ≤ now`, existing receiving validations.
3. Transaction opens. Inside `tx`:
   - Insert `store_receivings` with `receivedDate = 2026-04-10`.
   - Upsert `store_stock` (quantity math unchanged).
   - Ledger entries via existing helper, `transactionDate = 2026-04-10`.
   - Build audit entry: action `store.receiveGoods`, `articleNumbers ["CB-1234"]`, `businessDate 2026-04-10`, pre-rendered description, existing metadata preserved.
   - `recordAuditLog(tx, params)`.
4. Transaction commits — stock, ledger, and audit row rise or fall together.
5. Reports filter on `transaction_date` → cost lands in April.
6. Audit views:
   - Global page sorted by `COALESCE(business_date, created_at)` — row appears among April 10 entries; recorded-date column shows 2026-05-22.
   - Product detail Activity panel for CB-1234 — same row in the chronological feed.

## Migration & backfill

Order of operations:

1. Migration adds `description` (nullable initially), `article_numbers` (default `{}`), `business_date`.
2. Backfill script (`scripts/backfill-audit-logs.ts`, idempotent):
   - For each row, resolve `articleNumbers` via the action-specific join path (e.g. `sale.create` → `shop_sales → shop_sale_items → shop_stock → product_colors → products`).
   - Render `description` via `renderAuditDescription`.
   - `businessDate` stays NULL (no historical backdating).
3. Migration tightens `description SET NOT NULL`.
4. Migration creates the GIN index.

Runs against dev/seed → staging → prod. Idempotent — re-running rewrites the same description.

## Testing

Vitest:

- `renderAuditDescription` — table-driven test, one row per action code, asserting sentence shape.
- Receiving function — three integration tests:
  1. Non-admin attempts backdated receive → rejected with the expected message; no rows written.
  2. Admin backdates within `[departureDate, today]` → `store_receivings.receivedDate`, `transactions.transactionDate`, and `audit_logs.business_date` all equal the chosen date; description contains both dates.
  3. Admin attempts date before `departureDate` → rejected with route-specific message; no rows written.
- `listAuditLog` — article filter, combined filters, cursor pagination.

Cypress (extends the existing receiving spec):

- Admin logs in, opens receiving form for an in-transit route, picks a past date, submits. Verifies stock counter, `/settings/audit-log` row presence, product detail Activity panel row presence.

## Rollout

Single feature branch, no flag needed. The new column defaults and the "default-to-today" date picker make the feature backwards-compatible for non-admin users. Standard deploy order: migration → wait → app code.

## Open questions / future work

- **Accounting period close.** Backdating today is gated only by the route's departure date and admin-only privilege. Once monthly bookkeeping matures (e.g. a tax accountant starts pulling statements), introduce a "lock date" admin setting that rejects entries on or before the lock. This design intentionally stores `transactionDate` and `createdAt` separately so this becomes a small future migration.
- **Backdating for other events** (transfers, sales, returns, payments) follows the same shape once the receiving pattern lands.
- **Export** of audit log (CSV / PDF) deferred until the client asks.
