# Low-stock notifications & restocking — design

**Date:** 2026-05-21
**Status:** Approved (pending user spec review)
**Author:** Brainstorming session with the user

## 1. Problem & goals

The inventory system already detects low stock with a flat `lowStockUnits = 5` threshold and writes a single in-app notification per scan. It re-emits on every run (no dedupe), has no email channel, has no admin-configurable thresholds, and offers no path from "this item is low" to "this item is being restocked."

This spec adds:

1. **Configurable thresholds** — global defaults for store (default 30%) and shop (default 15%), with per-product overrides and discoverable per-shop overrides.
2. **Percentage-based detection** — a "30% remaining" rule uses a rolling-average baseline of the last 3 batches that delivered that variant.
3. **In-app notifications** that dedupe (one open alert per variant) and auto-resolve when stock recovers.
4. **Daily email digest** at 07:00 EAT to admins + supervisors using Resend + React Email.
5. **Shop restock flow** — a per-shop "Restock suggestions" page that lists currently-low variants with a recommended quantity and creates one bundled store→shop transfer.
6. **Store restock flow** — a `restock_requisitions` queue. Open requisitions can be promoted into lines on a planning supply route.

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Cloudflare cron — hourly: 0 * * * *                                │
│     └─ runThresholdChecks()                                         │
│             ├─ for each shop_stock row → resolve rule → compare     │
│             │       └─ if low + no open alert → open low_stock_alert│
│             │       └─ if no longer low → resolve open alert        │
│             └─ for each store_stock row → resolve rule → compare    │
│                     └─ same as above PLUS create restock_requisition│
│                                                                     │
│  Cloudflare cron — daily: 0 4 * * * (07:00 EAT)                     │
│     └─ sendDailyLowStockDigest() → Resend email to admins+supers    │
└─────────────────────────────────────────────────────────────────────┘

New tables:
  • notification_thresholds         — singleton row: store + shop defaults
  • notification_threshold_overrides — by (productColorId, size, optional shopId)
  • low_stock_alerts                — open/resolved dedupe per (scope, location, variant)
  • restock_requisitions            — store-side queue, promotable to supply_route_items

New UI:
  • /settings/notifications              — global thresholds + product overrides + "Run check now"
  • /settings/shops/$shopId/overrides    — per-shop overrides (discoverable, not primary)
  • /shop/$shopId/restock                — current low items + create transfer
  • /store/restock-requisitions          — open requisitions + promote to supply route
  • Notification bell — new kind low_stock_open with deep links

New library code:
  • src/lib/notifications/baseline.ts    — rolling avg of last 3 receipts/transfers
  • src/lib/notifications/thresholds.ts  — extended rule resolution
  • src/lib/notifications/check.ts       — pure comparison helpers
  • src/lib/emails/low-stock-digest.tsx  — React Email + Tailwind template
  • src/lib/email.ts                     — adds sendLowStockDigest
```

The runtime contract: `runThresholdChecks(now)` is idempotent — safe to invoke twice in the same minute. Email digest is a separate function run once daily.

## 3. Data model

Four new tables. Existing tables (`shop_stock`, `store_stock`, `supply_routes`, `store_transfers`) are unchanged.

```ts
// src/db/schema/notifications.ts (extends existing file)

export const thresholdModeEnum = pgEnum("threshold_mode", ["percent", "units"])
export const thresholdScopeEnum = pgEnum("threshold_scope", ["store", "shop"])
export const lowStockAlertStatusEnum = pgEnum("low_stock_alert_status", ["open", "resolved"])
export const requisitionStatusEnum = pgEnum("restock_requisition_status",
  ["open", "planned", "fulfilled", "dismissed"])

// Singleton config row (id = 'global'). Holds the two defaults.
export const notificationThresholds = pgTable("notification_thresholds", {
  id: text("id").primaryKey().default("global"),  // CHECK constraint enforces id='global'
  storeMode: thresholdModeEnum("store_mode").notNull().default("percent"),
  storeValue: numeric("store_value", { precision: 10, scale: 2 }).notNull().default("30"),
  shopMode:  thresholdModeEnum("shop_mode").notNull().default("percent"),
  shopValue: numeric("shop_value", { precision: 10, scale: 2 }).notNull().default("15"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow().$onUpdate(() => new Date()).notNull(),
  updatedBy: text("updated_by").references(() => user.id),
})

// Overrides: by product-variant, optionally scoped to one shop.
// shopId NULL = applies to all locations at that scope.
export const notificationThresholdOverrides = pgTable("notification_threshold_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: thresholdScopeEnum("scope").notNull(),
  productColorId: uuid("product_color_id").notNull()
    .references(() => productColors.id, { onDelete: "cascade" }),
  size: text("size").notNull(),
  shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
  mode: thresholdModeEnum("mode").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow().$onUpdate(() => new Date()).notNull(),
}, t => [
  unique("uq_thr_override").on(t.scope, t.productColorId, t.size, t.shopId),
  index("idx_thr_override_variant").on(t.productColorId, t.size),
])

// Dedupe table — exactly one open row per (scope, locationId, variant).
export const lowStockAlerts = pgTable("low_stock_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: thresholdScopeEnum("scope").notNull(),
  locationId: uuid("location_id").notNull(),
  productColorId: uuid("product_color_id").notNull()
    .references(() => productColors.id, { onDelete: "restrict" }),
  size: text("size").notNull(),
  status: lowStockAlertStatusEnum("status").notNull().default("open"),
  baselineQuantity: integer("baseline_quantity").notNull(),
  thresholdSnapshot: jsonb("threshold_snapshot")
    .$type<{ mode: "percent" | "units"; value: number }>().notNull(),
  quantityAtOpen: integer("quantity_at_open").notNull(),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notificationId: uuid("notification_id")
    .references(() => notifications.id, { onDelete: "set null" }),
}, t => [
  index("idx_lsa_status_scope").on(t.status, t.scope),
  index("idx_lsa_location").on(t.locationId),
  uniqueIndex("uq_lsa_open")
    .on(t.scope, t.locationId, t.productColorId, t.size)
    .where(sql`status = 'open'`),
])

// Store-side restock queue.
export const restockRequisitions = pgTable("restock_requisitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull()
    .references(() => stores.id, { onDelete: "restrict" }),
  productColorId: uuid("product_color_id").notNull()
    .references(() => productColors.id, { onDelete: "restrict" }),
  size: text("size").notNull(),
  suggestedQuantity: integer("suggested_quantity").notNull(),
  baselineQuantity: integer("baseline_quantity").notNull(),
  quantityAtOpen: integer("quantity_at_open").notNull(),
  status: requisitionStatusEnum("status").notNull().default("open"),
  supplyRouteItemId: uuid("supply_route_item_id")
    .references(() => supplyRouteItems.id, { onDelete: "set null" }),
  dismissedReason: text("dismissed_reason"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, t => [
  index("idx_req_store_status").on(t.storeId, t.status),
  uniqueIndex("uq_req_open")
    .on(t.storeId, t.productColorId, t.size)
    .where(sql`status = 'open'`),
])
```

### Design choices

- **Singleton thresholds row** with literal id `'global'` and a CHECK constraint — keeps "current config" trivially queryable.
- **Threshold snapshot on the alert.** The rule the system used when it opened the alert is frozen on the row. Admin moving the threshold later does not retroactively re-evaluate open alerts.
- **Partial unique indexes** (`WHERE status = 'open'`) enforce the dedupe invariant at the DB level. Postgres-only; acceptable.
- **No persistent shop requisitions table.** Shop suggestions are computed live from `shop_stock + thresholds + baseline`. Shop restock cycles in hours, not weeks — persistence isn't worth it.

## 4. Rule resolution & baseline computation

```ts
// src/lib/notifications/thresholds.ts
type Rule = { mode: "percent" | "units"; value: number }

resolveShopRule(shopId, productColorId, size, overrides, globals): Rule
  // Order: shop+variant override → variant-only override → global shop default

resolveStoreRule(productColorId, size, overrides, globals): Rule
  // Order: variant override → global store default

// src/lib/notifications/baseline.ts
computeShopBaseline(shopId, productColorId, size):
  { baseline: number; sampleCount: 0 | 1 | 2 | 3 }
  // Avg of last 3 store_transfer_items that delivered this exact variant
  // to this shop. Join store_transfer_items → store_transfers ON store_transfer_id,
  // filter by store_transfers.shop_id = shopId; resolve variant via the
  // store_stock row referenced by store_transfer_items.store_stock_id.
  // Ordered by store_transfer_items.created_at DESC. Uses quantityReceived;
  // falls back to quantityDispatched on in-transit transfers.

computeStoreBaseline(storeId, productColorId, size):
  { baseline: number; sampleCount: 0 | 1 | 2 | 3 }
  // Avg of last 3 store_receivings for that variant, joined via
  // supply_route_items, ordered by receivedDate DESC. Uses quantityReceived.

// src/lib/notifications/check.ts
isBelowThreshold(quantityOnHand, baseline, rule):
  { below: boolean; reason: "no_baseline_for_percent" | "zero_baseline" | "below" | "above" }
```

Resolution runs once per check pass with the overrides table loaded into memory — at expected scale (<1000 overrides) an in-memory map keyed by `(scope, productColorId, size, shopId)` outperforms per-row queries.

### Edge cases

| Situation | Behaviour |
|---|---|
| Rule = `units` | `qoh <= rule.value` → below. Baseline ignored. |
| Rule = `percent`, `sampleCount >= 1` | Use available baseline. |
| Rule = `percent`, `sampleCount === 0` | **Skip alert entirely.** Debug log it. |
| Rule = `percent`, baseline = 0 | Skip alert entirely (same as no history). |
| `quantityOnHand` negative | Treat as 0; alert opens. |

### Suggested restock quantity (UI hint, not the check)

```
suggestedQuantity = max(0, round(baseline) - quantityOnHand)
```

Admin can override on the suggestions page or requisition row.

## 5. Data flow

### Flow A — Hourly check `runThresholdChecks(now)`

For each `shop_stock` row:
1. Resolve rule using in-memory override map.
2. Compute baseline.
3. Compute `below`.
4. Look up any `low_stock_alerts` with `(scope='shop', locationId=shopId, variant=..., status='open')`.

| State | Action |
|---|---|
| `below && !openAlert` | INSERT `low_stock_alerts` (status='open', snapshot rule + baseline + qoh). Emit in-app notification (kind=`low_stock_open`). Persist `notification.id` on the alert. |
| `!below && openAlert` | UPDATE alert SET `status='resolved'`, `resolvedAt=now`. |
| Other | No-op. |

For each `store_stock` row: same as above, **plus** on the open transition also INSERT a `restock_requisitions` row with `suggestedQuantity = max(0, baseline - qoh)`. On the resolve transition, also UPDATE the matching open requisition (if any) to `status='fulfilled'`.

The partial-unique-index on open rows lets the cron run safely under any cadence — duplicate-open inserts hit a constraint violation and the loop treats it as "already open."

### Flow B — Shop restock (existing transfer flow + new entry point)

1. Admin clicks notification → `/shop/$shopId/restock`.
2. Page query lists `shop_stock` rows where an open `low_stock_alert` exists for `(scope='shop', locationId=$shopId)`, joined with baseline + suggested-quantity columns.
3. Admin selects rows, edits quantities, clicks "Create transfer."
4. Reuses existing `createTransfer` server fn with `shopId` pre-set + `items[]`.
5. When the transfer is later RECEIVED at the shop and the next cron pass sees `quantityOnHand > threshold`, the alert flips to `resolved` automatically.

Single-variant quick action on the notification card is a deep link to `/shop/$shopId/restock?variant=<id>` with that row pre-selected.

### Flow C — Store requisition → supply route

1. `/store/restock-requisitions` shows all `status='open'` requisitions across all stores.
2. Admin bulk-selects, clicks "Add to supply route."
3. Modal: pick an existing route in `status='planning'` OR "Create new route."
4. `promoteRequisitionsToRoute({ requisitionIds, supplyRouteId })` server fn (transactional, `SELECT … FOR UPDATE`):
   - For each requisition: INSERT `supply_route_items` (`quantity = suggestedQuantity`, etc.), UPDATE requisition SET `status='planned'`, `supplyRouteItemId=<new>`.
5. Admin can also "Dismiss" a requisition with a reason → `status='dismissed'`.
6. When the supply route reaches `status='received'` and store stock crosses back above threshold, next cron pass marks the alert resolved and the requisition `fulfilled`.

### Flow D — Daily digest at 07:00 EAT

1. Aggregate open alerts: counts by scope; top-10 across both scopes by severity `1 - qoh/baseline` (units-mode alerts use `1 - qoh/value` for ranking).
2. If zero open alerts → exit silently (no empty email).
3. Render `LowStockDigestTemplate` (React Email + Tailwind).
4. For each recipient (`user.role IN ('admin', 'supervisor') AND emailVerified = true AND banned = false`):
   - `resend.emails.send({ react: LowStockDigestTemplate(...) })`
   - Per-recipient try/catch; one failure does not block the rest.

### Cron triggers (wrangler.jsonc)

```jsonc
"triggers": {
  "crons": [
    "0 * * * *",   // runThresholdChecks — hourly
    "0 4 * * *"    // sendDailyLowStockDigest — 04:00 UTC = 07:00 EAT
  ]
}
```

The worker's `scheduled(event, env, ctx)` handler routes on `event.cron` and `ctx.waitUntil`s the right function. Both internal functions (`runThresholdChecksInternal`, `sendDailyLowStockDigestInternal`) live outside `createServerFn` because the scheduled handler has no session. The existing `runThresholdChecks` server fn stays as an admin-gated manual trigger ("Run check now" button on the settings page).

**Note on scheduled-handler infra:** the current TanStack Start + Cloudflare Workers entry may not yet export a `scheduled` handler. Adding one is part of this work — including wiring `wrangler.jsonc` `triggers.crons` and ensuring `vite.config` / the TanStack Start adapter exposes a worker entry that supports both `fetch` and `scheduled` handlers.

## 6. Email visual design

Use the existing `EmailLayout` pattern (`src/lib/emails/_layout.tsx`) as the visual baseline — same gradient header, same brand colours, same card style — and extend it. The digest is content-heavy, so a new dedicated template lives at `src/lib/emails/low-stock-digest.tsx` and uses:

- **React Email** components: `Html`, `Head`, `Preview`, `Body`, `Container`, `Section`, `Heading`, `Text`, `Button`, `Hr`, `Img`, `Link`.
- **Tailwind** via `@react-email/components`' `<Tailwind>` wrapper (already in use).
- **Brand palette** matching the existing emails: blue gradient header `from-[#4DA6FF] to-[#0066E6]`, slate body text, white card on slate-50 background.
- **Severity colour coding** for alert rows:
  - Critical (≤ 25% remaining or rule is `units` and qoh = 0): rose-50 background, rose-700 text, rose-200 border-l-4.
  - Warning (otherwise): amber-50 background, amber-700 text, amber-200 border-l-4.
- **Header summary card** with two big stat tiles ("3 store items low" / "12 shop items low across 4 shops"), each tile a coloured pill.
- **Top-10 list** as a table-row component with: product name, color, size, "X of Y left" (qoh / baseline), severity pill.
- **Two CTA buttons** side-by-side: "Store requisitions →" (links `/store/restock-requisitions`) and "Shop suggestions →" (links shop selector if multiple shops are low, or directly to the single low shop). Buttons use the existing blue brand colour.
- **Footer** mirrors `EmailLayout`'s footer (year, brand line) with an opt-out hint (manage in `/settings/notifications`).

The template is exported as a function that takes a typed `LowStockDigestData` and is renderable as a React component for previewing (e.g., via `react-email dev`). A small fixture file at `src/lib/emails/__fixtures__/low-stock-digest.tsx` exports sample data so the template renders in the React Email dev server without needing the DB.

```ts
// Shape passed to LowStockDigestTemplate
export type LowStockDigestData = {
  recipientName: string
  appUrl: string
  generatedAt: Date         // formatted in EAT in the template
  storeLowCount: number     // count of open store-scope alerts
  shopLowCount: number      // count of open shop-scope alerts
  shopsAffectedCount: number
  topItems: Array<{
    scope: "store" | "shop"
    locationName: string    // shop name or store name
    productLabel: string    // formatProductLabel(article#, color, size)
    quantityOnHand: number
    baseline: number        // for percent rules; equals threshold value for units rules
    rule: { mode: "percent" | "units"; value: number }
    severity: "critical" | "warning"
  }>
  storeRequisitionsUrl: string  // /store/restock-requisitions
  shopSuggestionsUrl: string    // /shop or a specific shop's restock page
  manageNotificationsUrl: string // /settings/notifications
}
```

## 7. UI surfaces

| Route / surface | Role | Purpose |
|---|---|---|
| `/settings/notifications` | admin | Edit global store/shop thresholds; manage product overrides; "Run check now" button. |
| `/settings/shops/$shopId/overrides` | admin | Per-shop overrides for specific variants. Reached via a "Stock alerts" tab on the shop detail or a sub-link from the product threshold row. |
| `/shop/$shopId/restock` | admin, supervisor | Per-shop suggestions; multi-select → creates transfer. |
| `/store/restock-requisitions` | admin, supervisor (view); admin (promote) | Open requisitions queue; bulk add to supply route. |
| Notification bell | admin, supervisor | New kind `low_stock_open` with deep link to the appropriate suggestions page. |

Each new form field, table header, and KPI card needs an `InfoTip` (per project convention, with descriptions added to `help-dictionary.ts`).

## 8. Error handling, security, edge cases

### Cron execution
- **Per-row exception** → log `{ scope, locationId, productColorId, size, error }`, continue. One bad row never blocks the rest.
- **Missed cron** → no backfill. Next hourly run picks up everything still low.
- **Daily digest partial failure** → per-recipient try/catch; do not retry (duplicate digests are worse than a missed one).

### Race conditions
- **Transfer received mid-check pass** → next pass resolves within an hour.
- **Manual transfer outside the requisition flow** → next pass resolves alert AND marks any open requisition for that variant `fulfilled`. Requisitions track *need*, not *fulfillment provenance*.
- **Two admins promote same requisition** → server fn does `SELECT ... FOR UPDATE` inside its transaction; second admin sees non-`open` status and gets a friendly error ("Already planned by Alice").

### RBAC

| Surface | Required role |
|---|---|
| In-app notifications | admin, supervisor |
| `/shop/$shopId/restock` | admin, supervisor |
| Create transfer from suggestions | admin, supervisor |
| `/store/restock-requisitions` view | admin, supervisor |
| Promote requisitions to supply route | admin only |
| Dismiss requisition | admin, supervisor |
| `/settings/notifications` edit | admin only |
| Per-shop overrides | admin only |
| Cron jobs | system (scheduled handler, no session) |

### Threshold-edit edge cases
- **Lower threshold (e.g., 15% → 10%)** → existing open alerts keep their snapshot rule, do not auto-resolve. New evaluations use the new rule.
- **Raise threshold (10% → 25%)** → existing alerts unaffected; next pass opens new alerts for anything now below at 25%.
- **Delete an override** → falls back to next-most-specific rule on next pass.
- **Delete a product or color** → override rows cascade-delete; `low_stock_alerts` and `restock_requisitions` use `ON DELETE RESTRICT` on `productColorId` (admin must dismiss/resolve first).

### Email recipients
- Audience = users with role `admin` or `supervisor`. Filter out users who can't or shouldn't receive email per the existing `src/db/schema/auth.ts` (e.g., unverified email, deactivated/banned). The precise field names are resolved during implementation against the current auth schema — do not assume `emailVerified` / `banned` columns exist verbatim.

### Data integrity
- **Singleton config row** — CHECK constraint forces `id = 'global'`. `getThresholds()` server fn upserts the default row if missing.
- **No history + percent rule** → skip with debug log.
- **Negative quantity** → treat as zero for percent calc; alert still opens.

## 9. Testing strategy

### Pure-function unit tests (Vitest, no DB)

```
src/lib/notifications/__tests__/
  thresholds.test.ts
    - resolveShopRule precedence
    - resolveStoreRule precedence
    - missing overrides → global default
  baseline.test.ts
    - computeShopBaseline with 0/1/2/3+ history
    - quantityReceived preferred; quantityDispatched fallback for in-transit
    - computeStoreBaseline same shape
  check.test.ts
    - units mode: qoh <= rule.value → below
    - percent mode: qoh / baseline <= rule.value/100 → below
    - percent + no baseline → "no_baseline_for_percent" (no alert)
    - percent + zero baseline → "zero_baseline" (no alert)
    - negative qoh treated as zero
```

### Integration tests (Vitest + Postgres test DB)

Follows existing pattern from `multi-clerk-isolation.test.ts` and `ledger-logic.test.ts`.

```
src/__tests__/low-stock-flow.test.ts
  - Drop below threshold → opens alert + notification
  - Second run → no duplicate
  - Restock → resolves alert
  - Drop again → fresh alert (re-arm)
  - Store low → opens alert AND requisition
  - promoteRequisitionsToRoute → creates supply_route_items + links requisition
  - Restock via that route → alert resolved, requisition fulfilled
  - Two admins promote same requisition → second gets friendly error
  - Per-shop override applied; global default elsewhere
  - Snapshot frozen on alert (admin changes threshold after open → alert unchanged)
  - Zero-baseline + percent → no alert
  - Units rule with zero history → alert still creates
  - Product deletion blocked while open alert exists

src/__tests__/low-stock-digest.test.ts
  - Digest body: counts, top-10 ranking by severity, deep links
  - Empty alert list → sendDailyLowStockDigest exits without calling Resend
  - Per-recipient failure does not block other recipients
```

### Component / route smoke tests

```
src/components/__tests__/
  threshold-form.test.tsx
    - Mode toggle (percent/units) updates input suffix
    - Validation: value > 0
  restock-suggestions.test.tsx
    - Renders only low items
    - Selected rows produce correct createTransfer payload
```

### Cypress e2e — one golden path

```
cypress/e2e/04-restock-flow.cy.ts
  - Admin drops shop stock via direct UI manipulation or seed helper
  - Triggers "Run check now"
  - Notification card appears
  - Click notification → /shop/$shopId/restock with the variant pre-checked
  - Create transfer → transfer appears in /store/transfers
  - Receive transfer → run check → notification disappears
```

### Out of scope for testing
- Cloudflare cron firing (Cloudflare's job).
- Resend's email delivery (SDK is mocked).
- Visual snapshots of the email template (too brittle).

## 10. Open items

None — all design decisions resolved during brainstorming session 2026-05-21.

## 11. Glossary

- **Baseline** — rolling average of the last 3 batches that delivered a given variant into a given location. The denominator for percentage rules and the basis for suggested restock quantities.
- **Rule** — a `{ mode: 'percent' | 'units', value: number }` pair that defines the low-stock threshold for a given (scope, variant, optional shop).
- **Open alert** — a `low_stock_alerts` row with `status='open'`. At most one per (scope, location, variant). Auto-resolves when stock recovers.
- **Requisition** — a `restock_requisitions` row. Open until promoted to a `supply_route_item` (planned), restocked (fulfilled), or admin-dismissed (dismissed).
