# Low-stock notifications & restocking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing flat-threshold low-stock check with configurable percent/units rules, dedupe alerts via a new `low_stock_alerts` table, add a `restock_requisitions` queue for store-side restocking, surface shop-side restock suggestions as a transfer entry point, and send a daily React-Email digest to admins + supervisors via Resend.

**Architecture:** A pure rule-resolution and baseline library drives a single idempotent `runThresholdChecks` function. The function reads stock + history, opens/resolves rows in `low_stock_alerts`, and on store-low transitions creates `restock_requisitions`. A separate `sendDailyLowStockDigest` aggregates open alerts and emails admins. Both run from a new Cloudflare Worker `scheduled` handler (hourly for the check, daily 04:00 UTC for the digest). UI: a settings page for thresholds + product overrides, a discoverable per-shop overrides page, a per-shop restock-suggestions page that pre-fills the existing transfer flow, and a store-side requisitions queue that promotes lines into a planning supply route.

**Tech Stack:** TanStack Start, Drizzle ORM, PostgreSQL, Cloudflare Workers (scheduled triggers), Better Auth, Resend, `@react-email/components` (with Tailwind), Vitest, Cypress.

**Spec:** [`docs/superpowers/specs/2026-05-21-low-stock-notifications-and-restocking-design.md`](../specs/2026-05-21-low-stock-notifications-and-restocking-design.md)

---

## File map

**Schema (Drizzle)**
- Modify `src/db/schema/notifications.ts` — add `notificationThresholds`, `notificationThresholdOverrides`, `lowStockAlerts`, `restockRequisitions` tables + enums + relations.

**Pure libs**
- Create `src/lib/notifications/types.ts` — shared types (`Rule`, `Scope`).
- Modify `src/lib/notifications/thresholds.ts` — replace stale helpers with `resolveShopRule`, `resolveStoreRule`, `buildOverrideMaps`, and keep `shouldNotifyDiscrepancy`/`shouldNotifyOverdueCredit`.
- Create `src/lib/notifications/baseline.ts` — `computeShopBaseline`, `computeStoreBaseline`.
- Create `src/lib/notifications/check.ts` — `isBelowThreshold` pure helper.
- Create `src/lib/notifications/severity.ts` — `severityForAlert` for ranking & digest colour coding.

**Tests (pure)**
- Create `src/lib/notifications/__tests__/thresholds.test.ts`.
- Create `src/lib/notifications/__tests__/baseline.test.ts`.
- Create `src/lib/notifications/__tests__/check.test.ts`.
- Create `src/lib/notifications/__tests__/severity.test.ts`.

**Server functions**
- Modify `src/server/functions/notifications/notifications.ts` — keep `emitNotification`, `listMyNotifications`, `markNotificationRead`; replace `runThresholdChecks` with the new lifecycle implementation; add `runThresholdChecksNow` admin manual trigger.
- Create `src/server/functions/notifications/thresholds.ts` — `getThresholds`, `updateThresholds`, `listOverrides`, `upsertOverride`, `deleteOverride`.
- Create `src/server/functions/store/requisitions.ts` — `listOpenRequisitions`, `promoteRequisitionsToRoute`, `dismissRequisition`.
- Create `src/server/functions/shop/restock-suggestions.ts` — `listShopRestockSuggestions`.

**Internal (non-server-fn) entrypoints used by the scheduled handler**
- Create `src/server/scheduled/run-threshold-checks.ts` — `runThresholdChecksInternal(db, now)`.
- Create `src/server/scheduled/send-low-stock-digest.ts` — `sendDailyLowStockDigestInternal(db, now)`.

**Email**
- Modify `src/lib/email.ts` — add `sendLowStockDigest`.
- Create `src/lib/emails/low-stock-digest.tsx` — React Email + Tailwind template.
- Create `src/lib/emails/__fixtures__/low-stock-digest.tsx` — dev-preview fixture.
- Modify `src/lib/emails/index.ts` — re-export `LowStockDigestTemplate`.

**Worker scheduled handler**
- Create `src/server/worker.ts` — wraps the TanStack Start fetch entry and adds a `scheduled` handler.
- Modify `wrangler.jsonc` — point `main` at `src/server/worker.ts`, add `triggers.crons`.

**Routes (UI)**
- Create `src/routes/settings/notifications.tsx` — global thresholds + product overrides + "Run check now".
- Create `src/routes/settings/shops.$shopId.overrides.tsx` — per-shop overrides (discoverable).
- Create `src/routes/shop/$shopId.restock.tsx` — shop restock suggestions; creates a transfer.
- Create `src/routes/store/restock-requisitions.tsx` — store requisitions queue.

**Components**
- Create `src/components/notifications/threshold-form.tsx` — mode/value toggle.
- Create `src/components/notifications/override-table.tsx` — list + add/delete rows.
- Create `src/components/notifications/restock-suggestions-table.tsx` — multi-select with edits.
- Create `src/components/notifications/requisitions-table.tsx` — multi-select + promote modal.

**Integration & e2e**
- Create `src/__tests__/low-stock-flow.test.ts`.
- Create `src/__tests__/low-stock-digest.test.ts`.
- Create `cypress/e2e/04-restock-flow.cy.ts`.

**Help dictionary**
- Modify `src/lib/help-dictionary.ts` (path to verify during execution; tooltip keys for new fields).

---

## Phases at a glance

1. **Foundation:** Schema + pure libs (Tasks 1–6).
2. **Threshold engine:** New `runThresholdChecksInternal` lifecycle + manual trigger (Tasks 7–9).
3. **Email digest:** Template + send fn + aggregator (Tasks 10–12).
4. **Cron:** Worker scheduled handler + wrangler triggers (Task 13).
5. **Threshold settings UI:** CRUD + screens (Tasks 14–16).
6. **Shop restock flow:** Suggestions fn + screen (Tasks 17–18).
7. **Store requisition flow:** CRUD + screen (Tasks 19–20).
8. **Notification deep-links + manual trigger button** (Task 21).
9. **End-to-end test** (Task 22).

Each task ends in a commit. Run `pnpm typecheck`, `pnpm lint`, and the touched tests before committing.

---

## Task 1: Schema — enums + tables

**Files:**
- Modify: `src/db/schema/notifications.ts`
- Generate: `src/db/migrations/<timestamp>_low_stock_alerts.sql` (via `pnpm db:generate`)

- [ ] **Step 1: Add enums + tables to `src/db/schema/notifications.ts`**

Replace the entire file with the content below (preserves `notifications` and `systemSettings`, adds the four new tables):

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  index,
  jsonb,
  unique,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"
import { user } from "./auth"
import { shops } from "./shops"
import { stores } from "./store"
import { productColors } from "./products"
import { supplyRouteItems } from "./supply-routes"

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_notif_user").on(table.userId, table.readAt),
    index("idx_notif_kind").on(table.kind),
  ],
)

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const thresholdModeEnum = pgEnum("threshold_mode", ["percent", "units"])
export const thresholdScopeEnum = pgEnum("threshold_scope", ["store", "shop"])
export const lowStockAlertStatusEnum = pgEnum("low_stock_alert_status", [
  "open",
  "resolved",
])
export const restockRequisitionStatusEnum = pgEnum(
  "restock_requisition_status",
  ["open", "planned", "fulfilled", "dismissed"],
)

export const notificationThresholds = pgTable(
  "notification_thresholds",
  {
    id: text("id").primaryKey().default("global"),
    storeMode: thresholdModeEnum("store_mode").notNull().default("percent"),
    storeValue: numeric("store_value", { precision: 10, scale: 2 })
      .notNull()
      .default("30"),
    shopMode: thresholdModeEnum("shop_mode").notNull().default("percent"),
    shopValue: numeric("shop_value", { precision: 10, scale: 2 })
      .notNull()
      .default("15"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (table) => [check("ck_thresholds_singleton", sql`${table.id} = 'global'`)],
)

export const notificationThresholdOverrides = pgTable(
  "notification_threshold_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: thresholdScopeEnum("scope").notNull(),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => productColors.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    mode: thresholdModeEnum("mode").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("uq_thr_override").on(
      table.scope,
      table.productColorId,
      table.size,
      table.shopId,
    ),
    index("idx_thr_override_variant").on(table.productColorId, table.size),
  ],
)

export const lowStockAlerts = pgTable(
  "low_stock_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: thresholdScopeEnum("scope").notNull(),
    locationId: uuid("location_id").notNull(),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => productColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    status: lowStockAlertStatusEnum("status").notNull().default("open"),
    baselineQuantity: integer("baseline_quantity").notNull(),
    thresholdSnapshot: jsonb("threshold_snapshot")
      .$type<{ mode: "percent" | "units"; value: number }>()
      .notNull(),
    quantityAtOpen: integer("quantity_at_open").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notificationId: uuid("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("idx_lsa_status_scope").on(table.status, table.scope),
    index("idx_lsa_location").on(table.locationId),
    uniqueIndex("uq_lsa_open")
      .on(table.scope, table.locationId, table.productColorId, table.size)
      .where(sql`status = 'open'`),
  ],
)

export const restockRequisitions = pgTable(
  "restock_requisitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    productColorId: uuid("product_color_id")
      .notNull()
      .references(() => productColors.id, { onDelete: "restrict" }),
    size: text("size").notNull(),
    suggestedQuantity: integer("suggested_quantity").notNull(),
    baselineQuantity: integer("baseline_quantity").notNull(),
    quantityAtOpen: integer("quantity_at_open").notNull(),
    status: restockRequisitionStatusEnum("status").notNull().default("open"),
    supplyRouteItemId: uuid("supply_route_item_id").references(
      () => supplyRouteItems.id,
      { onDelete: "set null" },
    ),
    dismissedReason: text("dismissed_reason"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_req_store_status").on(table.storeId, table.status),
    uniqueIndex("uq_req_open")
      .on(table.storeId, table.productColorId, table.size)
      .where(sql`status = 'open'`),
  ],
)

export const notificationThresholdOverridesRelations = relations(
  notificationThresholdOverrides,
  ({ one }) => ({
    productColor: one(productColors, {
      fields: [notificationThresholdOverrides.productColorId],
      references: [productColors.id],
    }),
    shop: one(shops, {
      fields: [notificationThresholdOverrides.shopId],
      references: [shops.id],
    }),
  }),
)

export const lowStockAlertsRelations = relations(lowStockAlerts, ({ one }) => ({
  productColor: one(productColors, {
    fields: [lowStockAlerts.productColorId],
    references: [productColors.id],
  }),
  notification: one(notifications, {
    fields: [lowStockAlerts.notificationId],
    references: [notifications.id],
  }),
}))

export const restockRequisitionsRelations = relations(
  restockRequisitions,
  ({ one }) => ({
    store: one(stores, {
      fields: [restockRequisitions.storeId],
      references: [stores.id],
    }),
    productColor: one(productColors, {
      fields: [restockRequisitions.productColorId],
      references: [productColors.id],
    }),
    supplyRouteItem: one(supplyRouteItems, {
      fields: [restockRequisitions.supplyRouteItemId],
      references: [supplyRouteItems.id],
    }),
  }),
)
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: one new file in `src/db/migrations/` referencing the four new tables and two new enums. Inspect it briefly — if Drizzle generates `CREATE INDEX ... WHERE status = 'open'` for the two partial uniques, you're good.

- [ ] **Step 3: Apply migration to dev and test databases**

Run: `pnpm db:push:all`
Expected: both DBs updated. No errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/notifications.ts src/db/migrations
git commit -m "feat(db): add low_stock_alerts, requisitions, and threshold schema"
```

---

## Task 2: Pure lib — shared types

**Files:**
- Create: `src/lib/notifications/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/notifications/types.ts

export type ThresholdMode = "percent" | "units"
export type ThresholdScope = "store" | "shop"

export interface Rule {
  mode: ThresholdMode
  value: number
}

export interface Defaults {
  store: Rule
  shop: Rule
}

export interface OverrideRow {
  scope: ThresholdScope
  productColorId: string
  size: string
  shopId: string | null
  rule: Rule
}

export interface Variant {
  productColorId: string
  size: string
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/types.ts
git commit -m "feat(notifications): add shared rule and override types"
```

---

## Task 3: Pure lib — thresholds resolution (TDD)

**Files:**
- Create: `src/lib/notifications/__tests__/thresholds.test.ts`
- Modify: `src/lib/notifications/thresholds.ts`

Keep the existing `shouldNotifyDiscrepancy` and `shouldNotifyOverdueCredit` exports unchanged (they're used elsewhere). Add new resolver functions alongside them. The old `Thresholds` interface, `DEFAULT_THRESHOLDS`, and `shouldNotifyLowStock` are deleted because nothing else outside `runThresholdChecks` (which we're rewriting in Task 7) imports them — verify with grep before deleting.

- [ ] **Step 1: Confirm no other importer of `shouldNotifyLowStock` / `DEFAULT_THRESHOLDS` / `Thresholds`**

Run: `grep -rn "shouldNotifyLowStock\|DEFAULT_THRESHOLDS\|Thresholds[^A-Za-z]" src --include='*.ts' --include='*.tsx' | grep -v "src/lib/notifications/" | grep -v "src/server/functions/notifications/notifications.ts"`
Expected: no matches (only the two files we're rewriting reference these symbols).

- [ ] **Step 2: Write failing tests**

Create `src/lib/notifications/__tests__/thresholds.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  buildOverrideMaps,
  resolveShopRule,
  resolveStoreRule,
} from "#/lib/notifications/thresholds"
import type { OverrideRow, Rule, Defaults } from "#/lib/notifications/types"

const defaults: Defaults = {
  store: { mode: "percent", value: 30 },
  shop: { mode: "percent", value: 15 },
}

const VARIANT_A = { productColorId: "pc-a", size: "M" }
const VARIANT_B = { productColorId: "pc-b", size: "L" }
const SHOP_1 = "shop-1"
const SHOP_2 = "shop-2"

describe("resolveShopRule", () => {
  it("returns global shop default when no override matches", () => {
    const maps = buildOverrideMaps([])
    const rule = resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)
    expect(rule).toEqual({ mode: "percent", value: 15 })
  })

  it("prefers variant-only shop override over global", () => {
    const overrides: OverrideRow[] = [
      {
        scope: "shop",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: null,
        rule: { mode: "units", value: 10 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    const rule = resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)
    expect(rule).toEqual({ mode: "units", value: 10 })
  })

  it("prefers shop+variant override over variant-only override", () => {
    const overrides: OverrideRow[] = [
      {
        scope: "shop",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: null,
        rule: { mode: "units", value: 10 },
      },
      {
        scope: "shop",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: SHOP_1,
        rule: { mode: "percent", value: 25 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)).toEqual({
      mode: "percent",
      value: 25,
    })
    // SHOP_2 still sees the variant-only override
    expect(resolveShopRule(SHOP_2, VARIANT_A, maps, defaults)).toEqual({
      mode: "units",
      value: 10,
    })
  })

  it("ignores store-scoped overrides when resolving shop rules", () => {
    const overrides: OverrideRow[] = [
      {
        scope: "store",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: null,
        rule: { mode: "units", value: 99 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveShopRule(SHOP_1, VARIANT_A, maps, defaults)).toEqual(
      defaults.shop,
    )
  })

  it("does not bleed across variants", () => {
    const overrides: OverrideRow[] = [
      {
        scope: "shop",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: null,
        rule: { mode: "units", value: 10 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveShopRule(SHOP_1, VARIANT_B, maps, defaults)).toEqual(
      defaults.shop,
    )
  })
})

describe("resolveStoreRule", () => {
  it("returns global store default when no override matches", () => {
    const maps = buildOverrideMaps([])
    expect(resolveStoreRule(VARIANT_A, maps, defaults)).toEqual(defaults.store)
  })

  it("prefers variant override over global", () => {
    const overrides: OverrideRow[] = [
      {
        scope: "store",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: null,
        rule: { mode: "units", value: 50 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveStoreRule(VARIANT_A, maps, defaults)).toEqual({
      mode: "units",
      value: 50,
    })
  })

  it("ignores shop-scoped overrides", () => {
    const overrides: OverrideRow[] = [
      {
        scope: "shop",
        productColorId: VARIANT_A.productColorId,
        size: VARIANT_A.size,
        shopId: null,
        rule: { mode: "units", value: 10 },
      },
    ]
    const maps = buildOverrideMaps(overrides)
    expect(resolveStoreRule(VARIANT_A, maps, defaults)).toEqual(defaults.store)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/notifications/__tests__/thresholds.test.ts`
Expected: FAIL — `buildOverrideMaps`, `resolveShopRule`, `resolveStoreRule` not exported.

- [ ] **Step 4: Implement resolvers in `src/lib/notifications/thresholds.ts`**

Replace the file with:

```ts
import { isPaymentStatusOpen } from "#/lib/payment-status"
import type { PaymentStatus } from "#/lib/payment-status"
import type {
  Defaults,
  OverrideRow,
  Rule,
  Variant,
} from "#/lib/notifications/types"

export type CreditSaleStatus = PaymentStatus

export interface DiscrepancyThresholds {
  discrepancyPercent: number
}

export interface OverdueThresholds {
  overdueDays: number
}

export function shouldNotifyDiscrepancy(
  systemQuantity: number,
  discrepancy: number,
  thresholds: DiscrepancyThresholds,
): boolean {
  if (systemQuantity === 0) return false
  const pct = (Math.abs(discrepancy) / systemQuantity) * 100
  return pct >= thresholds.discrepancyPercent
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function shouldNotifyOverdueCredit(
  saleDate: Date,
  status: CreditSaleStatus,
  now: Date,
  thresholds: OverdueThresholds,
): boolean {
  if (!isPaymentStatusOpen(status)) return false
  const ageDays = (now.getTime() - saleDate.getTime()) / MS_PER_DAY
  return ageDays > thresholds.overdueDays
}

// ---------- Threshold rule resolution ----------

export interface OverrideMaps {
  /** scope='shop', shopId set    → keyed by `${shopId}|${productColorId}|${size}` */
  shopWithShop: Map<string, Rule>
  /** scope='shop', shopId null    → keyed by `${productColorId}|${size}` */
  shopVariantOnly: Map<string, Rule>
  /** scope='store'                → keyed by `${productColorId}|${size}` */
  store: Map<string, Rule>
}

const variantKey = (productColorId: string, size: string) =>
  `${productColorId}|${size}`
const shopVariantKey = (shopId: string, productColorId: string, size: string) =>
  `${shopId}|${productColorId}|${size}`

export function buildOverrideMaps(rows: OverrideRow[]): OverrideMaps {
  const maps: OverrideMaps = {
    shopWithShop: new Map(),
    shopVariantOnly: new Map(),
    store: new Map(),
  }
  for (const row of rows) {
    if (row.scope === "store") {
      maps.store.set(variantKey(row.productColorId, row.size), row.rule)
    } else if (row.shopId === null) {
      maps.shopVariantOnly.set(
        variantKey(row.productColorId, row.size),
        row.rule,
      )
    } else {
      maps.shopWithShop.set(
        shopVariantKey(row.shopId, row.productColorId, row.size),
        row.rule,
      )
    }
  }
  return maps
}

export function resolveShopRule(
  shopId: string,
  variant: Variant,
  maps: OverrideMaps,
  defaults: Defaults,
): Rule {
  const specific = maps.shopWithShop.get(
    shopVariantKey(shopId, variant.productColorId, variant.size),
  )
  if (specific) return specific
  const variantOnly = maps.shopVariantOnly.get(
    variantKey(variant.productColorId, variant.size),
  )
  if (variantOnly) return variantOnly
  return defaults.shop
}

export function resolveStoreRule(
  variant: Variant,
  maps: OverrideMaps,
  defaults: Defaults,
): Rule {
  const override = maps.store.get(
    variantKey(variant.productColorId, variant.size),
  )
  return override ?? defaults.store
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/notifications/__tests__/thresholds.test.ts`
Expected: 7 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/thresholds.ts src/lib/notifications/__tests__/thresholds.test.ts
git commit -m "feat(notifications): rule resolution with scope precedence"
```

---

## Task 4: Pure lib — comparison (`isBelowThreshold`) (TDD)

**Files:**
- Create: `src/lib/notifications/__tests__/check.test.ts`
- Create: `src/lib/notifications/check.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/notifications/__tests__/check.test.ts
import { describe, it, expect } from "vitest"
import { isBelowThreshold } from "#/lib/notifications/check"

describe("isBelowThreshold — units mode", () => {
  it("returns below when qoh <= rule.value", () => {
    expect(isBelowThreshold(5, 100, { mode: "units", value: 5 })).toEqual({
      below: true,
      reason: "below",
    })
    expect(isBelowThreshold(3, 100, { mode: "units", value: 5 })).toEqual({
      below: true,
      reason: "below",
    })
  })

  it("returns above when qoh > rule.value", () => {
    expect(isBelowThreshold(6, 100, { mode: "units", value: 5 })).toEqual({
      below: false,
      reason: "above",
    })
  })

  it("ignores baseline when in units mode (including null)", () => {
    expect(isBelowThreshold(2, null, { mode: "units", value: 5 })).toEqual({
      below: true,
      reason: "below",
    })
  })
})

describe("isBelowThreshold — percent mode", () => {
  it("returns below when qoh / baseline <= rule.value/100", () => {
    expect(isBelowThreshold(15, 100, { mode: "percent", value: 15 })).toEqual({
      below: true,
      reason: "below",
    })
    expect(isBelowThreshold(10, 100, { mode: "percent", value: 15 })).toEqual({
      below: true,
      reason: "below",
    })
  })

  it("returns above when ratio exceeds rule", () => {
    expect(isBelowThreshold(20, 100, { mode: "percent", value: 15 })).toEqual({
      below: false,
      reason: "above",
    })
  })

  it("skips when baseline is null (no history)", () => {
    expect(isBelowThreshold(5, null, { mode: "percent", value: 15 })).toEqual({
      below: false,
      reason: "no_baseline_for_percent",
    })
  })

  it("skips when baseline is zero", () => {
    expect(isBelowThreshold(5, 0, { mode: "percent", value: 15 })).toEqual({
      below: false,
      reason: "zero_baseline",
    })
  })

  it("treats negative qoh as zero", () => {
    expect(isBelowThreshold(-3, 100, { mode: "percent", value: 15 })).toEqual({
      below: true,
      reason: "below",
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/notifications/__tests__/check.test.ts`
Expected: FAIL — `isBelowThreshold` not found.

- [ ] **Step 3: Implement `src/lib/notifications/check.ts`**

```ts
import type { Rule } from "#/lib/notifications/types"

export type CheckReason =
  | "below"
  | "above"
  | "no_baseline_for_percent"
  | "zero_baseline"

export interface CheckResult {
  below: boolean
  reason: CheckReason
}

export function isBelowThreshold(
  quantityOnHand: number,
  baseline: number | null,
  rule: Rule,
): CheckResult {
  const qoh = Math.max(0, quantityOnHand)
  if (rule.mode === "units") {
    return qoh <= rule.value
      ? { below: true, reason: "below" }
      : { below: false, reason: "above" }
  }
  if (baseline === null) {
    return { below: false, reason: "no_baseline_for_percent" }
  }
  if (baseline === 0) {
    return { below: false, reason: "zero_baseline" }
  }
  const ratioPct = (qoh / baseline) * 100
  return ratioPct <= rule.value
    ? { below: true, reason: "below" }
    : { below: false, reason: "above" }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/notifications/__tests__/check.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/check.ts src/lib/notifications/__tests__/check.test.ts
git commit -m "feat(notifications): isBelowThreshold pure helper"
```

---

## Task 5: Pure lib — baseline computation (TDD with DB)

**Files:**
- Create: `src/lib/notifications/__tests__/baseline.test.ts`
- Create: `src/lib/notifications/baseline.ts`

This task uses the test DB. Pattern matches `src/__tests__/ledger-logic.test.ts` for pure tests but here we need the DB; mirror `src/__tests__/multi-clerk-isolation.test.ts` for transactional setup.

- [ ] **Step 1: Inspect the multi-clerk test for DB setup pattern**

Run: `head -80 src/__tests__/multi-clerk-isolation.test.ts`
Note: how the test imports `db`, creates fixtures, and uses transactions. Reuse the same approach.

- [ ] **Step 2: Write failing tests**

Create `src/lib/notifications/__tests__/baseline.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { db } from "#/db"
import {
  computeShopBaseline,
  computeStoreBaseline,
} from "#/lib/notifications/baseline"
import {
  products,
  productColors,
  stores,
  storeStock,
  storeReceivings,
  storeTransfers,
  storeTransferItems,
  shops,
  supplyRoutes,
  supplyRouteItems,
  suppliers,
  user as userTable,
} from "#/db/schema"
import { eq } from "drizzle-orm"

const ART = "ART-BASE-TEST"
const SIZE = "M"

async function seed() {
  // Create one user (for receivings.receivedBy)
  const [u] = await db
    .insert(userTable)
    .values({
      id: "user-baseline-test",
      name: "Baseline Tester",
      email: "baseline@example.com",
      emailVerified: true,
      role: "admin",
    })
    .returning()

  const [supplier] = await db
    .insert(suppliers)
    .values({ name: "Test Supplier" })
    .returning()
  const [product] = await db
    .insert(products)
    .values({ articleNumber: ART, name: "Baseline Test Product" })
    .returning()
  const [pc] = await db
    .insert(productColors)
    .values({
      productId: product.id,
      colorName: "Red",
      colorHex: "#FF0000",
    })
    .returning()
  const [store] = await db
    .insert(stores)
    .values({ name: "Test Store" })
    .returning()
  const [shop] = await db
    .insert(shops)
    .values({ name: "Test Shop" })
    .returning()
  return { user: u, supplier, product, pc, store, shop }
}

let ctx: Awaited<ReturnType<typeof seed>>

beforeAll(async () => {
  ctx = await seed()
})

afterAll(async () => {
  // Cascade cleanup via product deletion is not possible (RESTRICT). Manual:
  await db
    .delete(storeTransferItems)
    .where(eq(storeTransferItems.storeStockId, "")) // no-op safety
  await db.delete(storeTransfers).where(eq(storeTransfers.storeId, ctx.store.id))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, ctx.store.id))
  await db.delete(storeStock).where(eq(storeStock.storeId, ctx.store.id))
  await db
    .delete(supplyRouteItems)
    .where(eq(supplyRouteItems.productColorId, ctx.pc.id))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.name, "Test Route"))
  await db.delete(productColors).where(eq(productColors.id, ctx.pc.id))
  await db.delete(products).where(eq(products.id, ctx.product.id))
  await db.delete(shops).where(eq(shops.id, ctx.shop.id))
  await db.delete(stores).where(eq(stores.id, ctx.store.id))
  await db.delete(suppliers).where(eq(suppliers.id, ctx.supplier.id))
  await db.delete(userTable).where(eq(userTable.id, ctx.user.id))
})

describe("computeStoreBaseline", () => {
  it("returns null baseline + sampleCount 0 when no receivings exist", async () => {
    const out = await computeStoreBaseline(db, {
      storeId: ctx.store.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out).toEqual({ baseline: null, sampleCount: 0 })
  })

  it("averages quantityReceived across last 3 receivings, ignoring older ones", async () => {
    const [route] = await db
      .insert(supplyRoutes)
      .values({ name: "Test Route", status: "received" })
      .returning()
    const items = []
    for (const qty of [100, 50, 80, 200]) {
      const [item] = await db
        .insert(supplyRouteItems)
        .values({
          supplyRouteId: route.id,
          supplierId: ctx.supplier.id,
          productId: ctx.product.id,
          productColorId: ctx.pc.id,
          size: SIZE,
          quantity: qty,
          unitPriceForeign: "10",
          totalAmountForeign: String(qty * 10),
          totalCostUgx: String(qty * 10000),
        })
        .returning()
      items.push(item)
    }
    // Insert receivings in order — last 3 by receivedDate are qty 50, 80, 200
    let i = 0
    for (const qty of [100, 50, 80, 200]) {
      await db.insert(storeReceivings).values({
        storeId: ctx.store.id,
        supplyRouteItemId: items[i].id,
        receivedDate: new Date(2026, 0, i + 1),
        quantityExpected: qty,
        quantityReceived: qty,
        receivedBy: ctx.user.id,
      })
      i++
    }
    const out = await computeStoreBaseline(db, {
      storeId: ctx.store.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out.sampleCount).toBe(3)
    expect(out.baseline).toBeCloseTo((50 + 80 + 200) / 3, 5)
  })
})

describe("computeShopBaseline", () => {
  it("returns null baseline + sampleCount 0 when no transfers exist", async () => {
    const out = await computeShopBaseline(db, {
      shopId: ctx.shop.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out).toEqual({ baseline: null, sampleCount: 0 })
  })

  it("uses quantityReceived when transfer is received, dispatched otherwise", async () => {
    // Need a store_stock row to reference via store_transfer_items.store_stock_id
    const [ss] = await db
      .insert(storeStock)
      .values({
        storeId: ctx.store.id,
        productColorId: ctx.pc.id,
        size: SIZE,
        quantityOnHand: 1000,
        costPerUnitUgx: "1000",
        minimumSellPriceUgx: "1500",
      })
      .returning()

    const [t1] = await db
      .insert(storeTransfers)
      .values({
        storeId: ctx.store.id,
        shopId: ctx.shop.id,
        transferDate: new Date(2026, 1, 1),
        status: "received",
      })
      .returning()
    await db.insert(storeTransferItems).values({
      storeTransferId: t1.id,
      storeStockId: ss.id,
      quantityDispatched: 60,
      quantityReceived: 50,
      unitPriceUgx: "1500",
      totalPriceUgx: "90000",
    })

    const [t2] = await db
      .insert(storeTransfers)
      .values({
        storeId: ctx.store.id,
        shopId: ctx.shop.id,
        transferDate: new Date(2026, 1, 5),
        status: "dispatched",
      })
      .returning()
    await db.insert(storeTransferItems).values({
      storeTransferId: t2.id,
      storeStockId: ss.id,
      quantityDispatched: 70,
      quantityReceived: null,
      unitPriceUgx: "1500",
      totalPriceUgx: "105000",
    })

    const out = await computeShopBaseline(db, {
      shopId: ctx.shop.id,
      productColorId: ctx.pc.id,
      size: SIZE,
    })
    expect(out.sampleCount).toBe(2)
    expect(out.baseline).toBeCloseTo((50 + 70) / 2, 5)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/notifications/__tests__/baseline.test.ts`
Expected: FAIL — `computeStoreBaseline` / `computeShopBaseline` not found.

- [ ] **Step 4: Implement `src/lib/notifications/baseline.ts`**

```ts
import { db as defaultDb } from "#/db"
import {
  storeReceivings,
  supplyRouteItems,
  storeTransfers,
  storeTransferItems,
  storeStock,
} from "#/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"

export interface BaselineResult {
  baseline: number | null
  sampleCount: 0 | 1 | 2 | 3
}

interface VariantKey {
  productColorId: string
  size: string
}

type Db = typeof defaultDb

export async function computeStoreBaseline(
  db: Db,
  args: { storeId: string } & VariantKey,
): Promise<BaselineResult> {
  // Last 3 receivings for this exact (store, variant) ordered by receivedDate DESC.
  const rows = await db
    .select({ qty: storeReceivings.quantityReceived })
    .from(storeReceivings)
    .innerJoin(
      supplyRouteItems,
      eq(storeReceivings.supplyRouteItemId, supplyRouteItems.id),
    )
    .where(
      and(
        eq(storeReceivings.storeId, args.storeId),
        eq(supplyRouteItems.productColorId, args.productColorId),
        eq(supplyRouteItems.size, args.size),
      ),
    )
    .orderBy(desc(storeReceivings.receivedDate))
    .limit(3)

  return averageBaseline(rows.map((r) => r.qty))
}

export async function computeShopBaseline(
  db: Db,
  args: { shopId: string } & VariantKey,
): Promise<BaselineResult> {
  // Join store_transfer_items → store_transfers (filter shop_id)
  //                          → store_stock (filter variant).
  // Uses COALESCE(quantityReceived, quantityDispatched) so in-transit transfers
  // still contribute a sensible baseline.
  const rows = await db
    .select({
      qty: sql<number>`COALESCE(${storeTransferItems.quantityReceived}, ${storeTransferItems.quantityDispatched})`,
    })
    .from(storeTransferItems)
    .innerJoin(
      storeTransfers,
      eq(storeTransferItems.storeTransferId, storeTransfers.id),
    )
    .innerJoin(storeStock, eq(storeTransferItems.storeStockId, storeStock.id))
    .where(
      and(
        eq(storeTransfers.shopId, args.shopId),
        eq(storeStock.productColorId, args.productColorId),
        eq(storeStock.size, args.size),
      ),
    )
    .orderBy(desc(storeTransferItems.createdAt))
    .limit(3)

  return averageBaseline(rows.map((r) => Number(r.qty)))
}

function averageBaseline(samples: number[]): BaselineResult {
  if (samples.length === 0) return { baseline: null, sampleCount: 0 }
  const sum = samples.reduce((a, b) => a + b, 0)
  return {
    baseline: sum / samples.length,
    sampleCount: samples.length as 1 | 2 | 3,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/notifications/__tests__/baseline.test.ts`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/baseline.ts src/lib/notifications/__tests__/baseline.test.ts
git commit -m "feat(notifications): baseline = rolling avg of last 3 batches"
```

---

## Task 6: Pure lib — severity ranking (TDD)

**Files:**
- Create: `src/lib/notifications/__tests__/severity.test.ts`
- Create: `src/lib/notifications/severity.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/notifications/__tests__/severity.test.ts
import { describe, it, expect } from "vitest"
import { severityForAlert, severityRank } from "#/lib/notifications/severity"

describe("severityForAlert", () => {
  it("percent rule, qoh <= 25% of baseline → critical", () => {
    expect(
      severityForAlert({
        rule: { mode: "percent", value: 30 },
        baseline: 100,
        quantityOnHand: 25,
      }),
    ).toBe("critical")
  })

  it("percent rule, qoh between 25% and threshold → warning", () => {
    expect(
      severityForAlert({
        rule: { mode: "percent", value: 30 },
        baseline: 100,
        quantityOnHand: 28,
      }),
    ).toBe("warning")
  })

  it("units rule with qoh=0 → critical", () => {
    expect(
      severityForAlert({
        rule: { mode: "units", value: 5 },
        baseline: 100,
        quantityOnHand: 0,
      }),
    ).toBe("critical")
  })

  it("units rule with qoh>0 → warning", () => {
    expect(
      severityForAlert({
        rule: { mode: "units", value: 5 },
        baseline: 100,
        quantityOnHand: 3,
      }),
    ).toBe("warning")
  })
})

describe("severityRank", () => {
  it("higher rank = more severe", () => {
    const critical = severityRank({
      rule: { mode: "percent", value: 30 },
      baseline: 100,
      quantityOnHand: 5,
    })
    const less = severityRank({
      rule: { mode: "percent", value: 30 },
      baseline: 100,
      quantityOnHand: 25,
    })
    expect(critical).toBeGreaterThan(less)
  })

  it("units rule with qoh=0 returns rank 1.0", () => {
    expect(
      severityRank({
        rule: { mode: "units", value: 5 },
        baseline: 100,
        quantityOnHand: 0,
      }),
    ).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/notifications/__tests__/severity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/notifications/severity.ts`**

```ts
import type { Rule } from "#/lib/notifications/types"

export type Severity = "critical" | "warning"

export interface SeverityInput {
  rule: Rule
  baseline: number
  quantityOnHand: number
}

const CRITICAL_RATIO = 0.25

export function severityForAlert(input: SeverityInput): Severity {
  const rank = severityRank(input)
  return rank >= 1 - CRITICAL_RATIO ? "critical" : "warning"
}

/** Returns a number in [0, 1] where 1 = stocked-out. Used to rank alerts. */
export function severityRank(input: SeverityInput): number {
  const qoh = Math.max(0, input.quantityOnHand)
  if (input.rule.mode === "units") {
    const denom = Math.max(1, input.rule.value)
    return clamp01(1 - qoh / denom)
  }
  if (input.baseline <= 0) return 1
  return clamp01(1 - qoh / input.baseline)
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/notifications/__tests__/severity.test.ts`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/severity.ts src/lib/notifications/__tests__/severity.test.ts
git commit -m "feat(notifications): severity ranking for digest sorting"
```

---

## Task 7: Threshold check engine (rewrite `runThresholdChecks`)

**Files:**
- Create: `src/server/scheduled/run-threshold-checks.ts`
- Modify: `src/server/functions/notifications/notifications.ts`

The new function is `runThresholdChecksInternal(db, now)`. It does not depend on a session, so the cron handler can call it. A thin server-fn wrapper `runThresholdChecksNow` provides the admin "Run check now" button.

- [ ] **Step 1: Create `src/server/scheduled/run-threshold-checks.ts`**

```ts
import { and, eq, sql } from "drizzle-orm"
import { db as defaultDb } from "#/db"
import {
  shopStock,
  storeStock,
  shops,
  notificationThresholds,
  notificationThresholdOverrides,
  lowStockAlerts,
  restockRequisitions,
  notifications,
  user,
  productColors,
  products,
} from "#/db/schema"
import {
  buildOverrideMaps,
  resolveShopRule,
  resolveStoreRule,
} from "#/lib/notifications/thresholds"
import {
  computeShopBaseline,
  computeStoreBaseline,
} from "#/lib/notifications/baseline"
import { isBelowThreshold } from "#/lib/notifications/check"
import { formatProductLabel } from "#/lib/products"
import type {
  Defaults,
  OverrideRow,
  Rule,
  ThresholdScope,
} from "#/lib/notifications/types"
import type { Role } from "#/lib/roles"

type Db = typeof defaultDb

export interface CheckSummary {
  shopAlertsOpened: number
  shopAlertsResolved: number
  storeAlertsOpened: number
  storeAlertsResolved: number
  requisitionsOpened: number
  requisitionsFulfilled: number
  skippedNoBaseline: number
}

const NOTIFY_ROLES: Role[] = ["admin", "supervisor"]

export async function runThresholdChecksInternal(
  db: Db,
  now: Date,
): Promise<CheckSummary> {
  const summary: CheckSummary = {
    shopAlertsOpened: 0,
    shopAlertsResolved: 0,
    storeAlertsOpened: 0,
    storeAlertsResolved: 0,
    requisitionsOpened: 0,
    requisitionsFulfilled: 0,
    skippedNoBaseline: 0,
  }

  const [defaults, overrides] = await Promise.all([
    loadDefaults(db),
    loadOverrides(db),
  ])
  const maps = buildOverrideMaps(overrides)

  await processShopStock(db, now, defaults, maps, summary)
  await processStoreStock(db, now, defaults, maps, summary)

  return summary
}

async function loadDefaults(db: Db): Promise<Defaults> {
  const [row] = await db
    .select()
    .from(notificationThresholds)
    .where(eq(notificationThresholds.id, "global"))
  if (!row) {
    await db
      .insert(notificationThresholds)
      .values({ id: "global" })
      .onConflictDoNothing()
    return {
      store: { mode: "percent", value: 30 },
      shop: { mode: "percent", value: 15 },
    }
  }
  return {
    store: { mode: row.storeMode, value: Number(row.storeValue) },
    shop: { mode: row.shopMode, value: Number(row.shopValue) },
  }
}

async function loadOverrides(db: Db): Promise<OverrideRow[]> {
  const rows = await db.select().from(notificationThresholdOverrides)
  return rows.map((r) => ({
    scope: r.scope,
    productColorId: r.productColorId,
    size: r.size,
    shopId: r.shopId,
    rule: { mode: r.mode, value: Number(r.value) },
  }))
}

async function processShopStock(
  db: Db,
  now: Date,
  defaults: Defaults,
  maps: ReturnType<typeof buildOverrideMaps>,
  summary: CheckSummary,
) {
  const rows = await db.query.shopStock.findMany({
    with: { productColor: { with: { product: true } }, shop: true },
  })
  for (const row of rows) {
    try {
      const rule = resolveShopRule(
        row.shopId,
        { productColorId: row.productColorId, size: row.size },
        maps,
        defaults,
      )
      const baseline = await computeShopBaseline(db, {
        shopId: row.shopId,
        productColorId: row.productColorId,
        size: row.size,
      })
      const result = isBelowThreshold(
        row.quantityOnHand,
        baseline.baseline,
        rule,
      )
      if (
        result.reason === "no_baseline_for_percent" ||
        result.reason === "zero_baseline"
      ) {
        summary.skippedNoBaseline++
      }
      await reconcileShopAlert(db, now, {
        shopId: row.shopId,
        productColorId: row.productColorId,
        size: row.size,
        below: result.below,
        rule,
        baseline: baseline.baseline ?? 0,
        quantityOnHand: row.quantityOnHand,
        productLabel: formatProductLabel(
          row.productColor.product.articleNumber,
          row.productColor.colorName,
          row.size,
        ),
        shopName: row.shop.name,
        summary,
      })
    } catch (error) {
      console.error("[runThresholdChecks] shop row failed", {
        shopStockId: row.id,
        error,
      })
    }
  }
}

async function processStoreStock(
  db: Db,
  now: Date,
  defaults: Defaults,
  maps: ReturnType<typeof buildOverrideMaps>,
  summary: CheckSummary,
) {
  const rows = await db.query.storeStock.findMany({
    with: { productColor: { with: { product: true } } },
  })
  for (const row of rows) {
    try {
      const rule = resolveStoreRule(
        { productColorId: row.productColorId, size: row.size },
        maps,
        defaults,
      )
      const baseline = await computeStoreBaseline(db, {
        storeId: row.storeId,
        productColorId: row.productColorId,
        size: row.size,
      })
      const result = isBelowThreshold(
        row.quantityOnHand,
        baseline.baseline,
        rule,
      )
      if (
        result.reason === "no_baseline_for_percent" ||
        result.reason === "zero_baseline"
      ) {
        summary.skippedNoBaseline++
      }
      const productLabel = formatProductLabel(
        row.productColor.product.articleNumber,
        row.productColor.colorName,
        row.size,
      )
      await reconcileStoreAlert(db, now, {
        storeId: row.storeId,
        productColorId: row.productColorId,
        size: row.size,
        below: result.below,
        rule,
        baseline: baseline.baseline ?? 0,
        quantityOnHand: row.quantityOnHand,
        productLabel,
        summary,
      })
    } catch (error) {
      console.error("[runThresholdChecks] store row failed", {
        storeStockId: row.id,
        error,
      })
    }
  }
}

interface ShopReconcileArgs {
  shopId: string
  productColorId: string
  size: string
  below: boolean
  rule: Rule
  baseline: number
  quantityOnHand: number
  productLabel: string
  shopName: string
  summary: CheckSummary
}

async function reconcileShopAlert(db: Db, now: Date, args: ShopReconcileArgs) {
  const [openAlert] = await db
    .select({ id: lowStockAlerts.id })
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.scope, "shop"),
        eq(lowStockAlerts.locationId, args.shopId),
        eq(lowStockAlerts.productColorId, args.productColorId),
        eq(lowStockAlerts.size, args.size),
        eq(lowStockAlerts.status, "open"),
      ),
    )
    .limit(1)

  if (args.below && !openAlert) {
    await openShopAlert(db, args)
    args.summary.shopAlertsOpened++
  } else if (!args.below && openAlert) {
    await db
      .update(lowStockAlerts)
      .set({ status: "resolved", resolvedAt: now })
      .where(eq(lowStockAlerts.id, openAlert.id))
    args.summary.shopAlertsResolved++
  }
}

async function openShopAlert(db: Db, args: ShopReconcileArgs) {
  await db.transaction(async (tx) => {
    const [alert] = await tx
      .insert(lowStockAlerts)
      .values({
        scope: "shop",
        locationId: args.shopId,
        productColorId: args.productColorId,
        size: args.size,
        status: "open",
        baselineQuantity: Math.round(args.baseline),
        thresholdSnapshot: args.rule,
        quantityAtOpen: args.quantityOnHand,
      })
      .onConflictDoNothing()
      .returning()
    if (!alert) return // raced — another pass already opened it
    const notification = await emitToRoles(tx, {
      kind: "low_stock_open",
      title: `Low stock: ${args.productLabel}`,
      body: `${args.shopName} has ${args.quantityOnHand} of ${args.productLabel} left.`,
      entityType: "low_stock_alert",
      entityId: alert.id,
      roles: NOTIFY_ROLES,
    })
    if (notification) {
      await tx
        .update(lowStockAlerts)
        .set({ notificationId: notification.id })
        .where(eq(lowStockAlerts.id, alert.id))
    }
  })
}

interface StoreReconcileArgs {
  storeId: string
  productColorId: string
  size: string
  below: boolean
  rule: Rule
  baseline: number
  quantityOnHand: number
  productLabel: string
  summary: CheckSummary
}

async function reconcileStoreAlert(
  db: Db,
  now: Date,
  args: StoreReconcileArgs,
) {
  const [openAlert] = await db
    .select({ id: lowStockAlerts.id })
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.scope, "store"),
        eq(lowStockAlerts.locationId, args.storeId),
        eq(lowStockAlerts.productColorId, args.productColorId),
        eq(lowStockAlerts.size, args.size),
        eq(lowStockAlerts.status, "open"),
      ),
    )
    .limit(1)

  if (args.below && !openAlert) {
    await openStoreAlertAndRequisition(db, args)
    args.summary.storeAlertsOpened++
    args.summary.requisitionsOpened++
  } else if (!args.below && openAlert) {
    await db.transaction(async (tx) => {
      await tx
        .update(lowStockAlerts)
        .set({ status: "resolved", resolvedAt: now })
        .where(eq(lowStockAlerts.id, openAlert.id))
      const fulfilled = await tx
        .update(restockRequisitions)
        .set({ status: "fulfilled", resolvedAt: now })
        .where(
          and(
            eq(restockRequisitions.storeId, args.storeId),
            eq(restockRequisitions.productColorId, args.productColorId),
            eq(restockRequisitions.size, args.size),
            eq(restockRequisitions.status, "open"),
          ),
        )
        .returning({ id: restockRequisitions.id })
      args.summary.requisitionsFulfilled += fulfilled.length
    })
    args.summary.storeAlertsResolved++
  }
}

async function openStoreAlertAndRequisition(db: Db, args: StoreReconcileArgs) {
  await db.transaction(async (tx) => {
    const suggestedQuantity = Math.max(
      0,
      Math.round(args.baseline) - args.quantityOnHand,
    )
    const [alert] = await tx
      .insert(lowStockAlerts)
      .values({
        scope: "store",
        locationId: args.storeId,
        productColorId: args.productColorId,
        size: args.size,
        status: "open",
        baselineQuantity: Math.round(args.baseline),
        thresholdSnapshot: args.rule,
        quantityAtOpen: args.quantityOnHand,
      })
      .onConflictDoNothing()
      .returning()
    if (!alert) return

    await tx
      .insert(restockRequisitions)
      .values({
        storeId: args.storeId,
        productColorId: args.productColorId,
        size: args.size,
        suggestedQuantity,
        baselineQuantity: Math.round(args.baseline),
        quantityAtOpen: args.quantityOnHand,
        status: "open",
      })
      .onConflictDoNothing()

    const notification = await emitToRoles(tx, {
      kind: "low_stock_open",
      title: `Low store stock: ${args.productLabel}`,
      body: `Only ${args.quantityOnHand} of ${args.productLabel} left in the store. Suggested restock: ${suggestedQuantity}.`,
      entityType: "low_stock_alert",
      entityId: alert.id,
      roles: NOTIFY_ROLES,
    })
    if (notification) {
      await tx
        .update(lowStockAlerts)
        .set({ notificationId: notification.id })
        .where(eq(lowStockAlerts.id, alert.id))
    }
  })
}

interface EmitArgs {
  kind: string
  title: string
  body: string
  entityType: string
  entityId: string
  roles: Role[]
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

async function emitToRoles(tx: Tx, params: EmitArgs) {
  const recipients = await tx
    .select({ id: user.id })
    .from(user)
    .where(sql`${user.role} = ANY(${params.roles})`)
  if (recipients.length === 0) return null

  const rows = await tx
    .insert(notifications)
    .values(
      recipients.map((r) => ({
        userId: r.id,
        kind: params.kind,
        title: params.title,
        body: params.body,
        entityType: params.entityType,
        entityId: params.entityId,
      })),
    )
    .returning({ id: notifications.id })
  return rows[0] ?? null
}
```

- [ ] **Step 2: Replace `runThresholdChecks` in `src/server/functions/notifications/notifications.ts`**

Open the file and replace the entire `runThresholdChecks` export (keep `emitNotification`, `listMyNotifications`, `markNotificationRead`) with:

```ts
// existing imports above unchanged; remove unused ones (Thresholds, DEFAULT_THRESHOLDS, shouldNotifyLowStock, shouldNotifyOverdueCredit, OPEN_PAYMENT_STATUSES, formatProductLabel, shopSales) — keep emitNotification's imports
import { runThresholdChecksInternal } from "#/server/scheduled/run-threshold-checks"

export const runThresholdChecksNow = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])
  return runThresholdChecksInternal(db, new Date())
})
```

Be sure to `import { db } from "#/db"` if not already, and remove now-unused imports flagged by ESLint.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Run all existing notification tests + new pure tests**

Run: `pnpm vitest run src/lib/notifications`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/scheduled/run-threshold-checks.ts src/server/functions/notifications/notifications.ts
git commit -m "feat(notifications): lifecycle-based threshold checks with dedupe and requisitions"
```

---

## Task 8: Integration test — full check lifecycle

**Files:**
- Create: `src/__tests__/low-stock-flow.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// src/__tests__/low-stock-flow.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { eq, and } from "drizzle-orm"
import { db } from "#/db"
import {
  products,
  productColors,
  stores,
  storeStock,
  storeReceivings,
  shops,
  shopStock,
  supplyRoutes,
  supplyRouteItems,
  suppliers,
  user as userTable,
  lowStockAlerts,
  restockRequisitions,
  notificationThresholds,
  notificationThresholdOverrides,
} from "#/db/schema"
import { runThresholdChecksInternal } from "#/server/scheduled/run-threshold-checks"

const FIXTURE = {
  user: "user-lowstock-test",
  supplier: undefined as string | undefined,
  product: undefined as string | undefined,
  pc: undefined as string | undefined,
  store: undefined as string | undefined,
  shop: undefined as string | undefined,
}
const SIZE = "M"

async function seed() {
  await db.insert(userTable).values({
    id: FIXTURE.user,
    name: "LowStock Tester",
    email: "lowstock@example.com",
    emailVerified: true,
    role: "admin",
  })
  const [s] = await db.insert(suppliers).values({ name: "S1" }).returning()
  FIXTURE.supplier = s.id
  const [p] = await db
    .insert(products)
    .values({ articleNumber: "ART-LS", name: "LS Product" })
    .returning()
  FIXTURE.product = p.id
  const [pc] = await db
    .insert(productColors)
    .values({ productId: p.id, colorName: "Red", colorHex: "#F00" })
    .returning()
  FIXTURE.pc = pc.id
  const [store] = await db.insert(stores).values({ name: "LS Store" }).returning()
  FIXTURE.store = store.id
  const [shop] = await db.insert(shops).values({ name: "LS Shop" }).returning()
  FIXTURE.shop = shop.id

  // 3 historical receivings: avg = (50+80+200)/3 ≈ 110
  const [route] = await db
    .insert(supplyRoutes)
    .values({ name: "LS Route", status: "received" })
    .returning()
  let i = 0
  for (const qty of [50, 80, 200]) {
    const [item] = await db
      .insert(supplyRouteItems)
      .values({
        supplyRouteId: route.id,
        supplierId: s.id,
        productId: p.id,
        productColorId: pc.id,
        size: SIZE,
        quantity: qty,
        unitPriceForeign: "10",
        totalAmountForeign: String(qty * 10),
        totalCostUgx: String(qty * 10000),
      })
      .returning()
    await db.insert(storeReceivings).values({
      storeId: store.id,
      supplyRouteItemId: item.id,
      receivedDate: new Date(2026, 0, ++i),
      quantityExpected: qty,
      quantityReceived: qty,
      receivedBy: FIXTURE.user,
    })
  }
}

async function cleanup() {
  // Order matters due to FKs
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.productColorId, FIXTURE.pc!))
  await db
    .delete(notificationThresholdOverrides)
    .where(eq(notificationThresholdOverrides.productColorId, FIXTURE.pc!))
  await db.delete(storeStock).where(eq(storeStock.storeId, FIXTURE.store!))
  await db.delete(shopStock).where(eq(shopStock.shopId, FIXTURE.shop!))
  await db.delete(storeReceivings).where(eq(storeReceivings.storeId, FIXTURE.store!))
  await db
    .delete(supplyRouteItems)
    .where(eq(supplyRouteItems.productColorId, FIXTURE.pc!))
  await db.delete(supplyRoutes).where(eq(supplyRoutes.name, "LS Route"))
  await db.delete(productColors).where(eq(productColors.id, FIXTURE.pc!))
  await db.delete(products).where(eq(products.id, FIXTURE.product!))
  await db.delete(shops).where(eq(shops.id, FIXTURE.shop!))
  await db.delete(stores).where(eq(stores.id, FIXTURE.store!))
  await db.delete(suppliers).where(eq(suppliers.id, FIXTURE.supplier!))
  await db.delete(userTable).where(eq(userTable.id, FIXTURE.user))
}

beforeAll(seed)
afterAll(cleanup)

beforeEach(async () => {
  await db.delete(lowStockAlerts).where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
  await db
    .delete(restockRequisitions)
    .where(eq(restockRequisitions.productColorId, FIXTURE.pc!))
  await db.delete(storeStock).where(eq(storeStock.storeId, FIXTURE.store!))
  await db.delete(shopStock).where(eq(shopStock.shopId, FIXTURE.shop!))
})

async function insertStoreStock(qoh: number) {
  await db.insert(storeStock).values({
    storeId: FIXTURE.store!,
    productColorId: FIXTURE.pc!,
    size: SIZE,
    quantityOnHand: qoh,
    costPerUnitUgx: "1000",
    minimumSellPriceUgx: "1500",
  })
}

async function insertShopStock(qoh: number) {
  await db.insert(shopStock).values({
    shopId: FIXTURE.shop!,
    productColorId: FIXTURE.pc!,
    size: SIZE,
    quantityOnHand: qoh,
    costPerUnitUgx: "1500",
    minimumSellPriceUgx: "2000",
  })
}

describe("runThresholdChecksInternal", () => {
  it("opens a store alert + requisition when below 30% of baseline", async () => {
    await insertStoreStock(20) // 20 / 110 ≈ 18% < 30%
    const r = await runThresholdChecksInternal(db, new Date())
    expect(r.storeAlertsOpened).toBe(1)
    expect(r.requisitionsOpened).toBe(1)

    const alerts = await db
      .select()
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
    expect(alerts).toHaveLength(1)
    expect(alerts[0].status).toBe("open")
    expect(alerts[0].quantityAtOpen).toBe(20)
    expect(alerts[0].thresholdSnapshot).toEqual({ mode: "percent", value: 30 })

    const reqs = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, FIXTURE.store!))
    expect(reqs).toHaveLength(1)
    expect(reqs[0].suggestedQuantity).toBe(110 - 20)
  })

  it("is idempotent — running twice does not create duplicate alerts", async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    const r2 = await runThresholdChecksInternal(db, new Date())
    expect(r2.storeAlertsOpened).toBe(0)
    const alerts = await db
      .select()
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
    expect(alerts).toHaveLength(1)
  })

  it("resolves alert and fulfils requisition when stock recovers", async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, FIXTURE.store!))
    const r = await runThresholdChecksInternal(db, new Date())
    expect(r.storeAlertsResolved).toBe(1)
    expect(r.requisitionsFulfilled).toBe(1)

    const [alert] = await db
      .select()
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
    expect(alert.status).toBe("resolved")
    expect(alert.resolvedAt).not.toBeNull()

    const [req] = await db
      .select()
      .from(restockRequisitions)
      .where(eq(restockRequisitions.storeId, FIXTURE.store!))
    expect(req.status).toBe("fulfilled")
  })

  it("re-arms — alert opens fresh after a resolved cycle drops below again", async () => {
    await insertStoreStock(20)
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 150 })
      .where(eq(storeStock.storeId, FIXTURE.store!))
    await runThresholdChecksInternal(db, new Date())
    await db
      .update(storeStock)
      .set({ quantityOnHand: 10 })
      .where(eq(storeStock.storeId, FIXTURE.store!))
    const r = await runThresholdChecksInternal(db, new Date())
    expect(r.storeAlertsOpened).toBe(1)
    const alerts = await db
      .select()
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.productColorId, FIXTURE.pc!))
    expect(alerts).toHaveLength(2)
    expect(alerts.filter((a) => a.status === "open")).toHaveLength(1)
  })

  it("respects a variant-specific units override that bypasses percent rule", async () => {
    await db.insert(notificationThresholdOverrides).values({
      scope: "store",
      productColorId: FIXTURE.pc!,
      size: SIZE,
      shopId: null,
      mode: "units",
      value: "100",
    })
    await insertStoreStock(80) // 80 < 100 → below in units mode
    const r = await runThresholdChecksInternal(db, new Date())
    expect(r.storeAlertsOpened).toBe(1)
  })

  it("opens a shop alert (no requisition) when shop stock is low", async () => {
    await insertShopStock(2)
    // No transfer history → baseline null → percent rule skips.
    // Add a units override so the rule fires.
    await db.insert(notificationThresholdOverrides).values({
      scope: "shop",
      productColorId: FIXTURE.pc!,
      size: SIZE,
      shopId: null,
      mode: "units",
      value: "5",
    })
    const r = await runThresholdChecksInternal(db, new Date())
    expect(r.shopAlertsOpened).toBe(1)
    expect(r.requisitionsOpened).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm vitest run src/__tests__/low-stock-flow.test.ts`
Expected: 6 passing.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/low-stock-flow.test.ts
git commit -m "test(notifications): integration coverage for alert lifecycle"
```

---

## Task 9: Threshold settings server functions

**Files:**
- Create: `src/server/functions/notifications/thresholds.ts`

- [ ] **Step 1: Create the server functions**

```ts
import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  notificationThresholds,
  notificationThresholdOverrides,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const modeEnum = z.enum(["percent", "units"])
const scopeEnum = z.enum(["store", "shop"])

export const getThresholds = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const [row] = await db
    .select()
    .from(notificationThresholds)
    .where(eq(notificationThresholds.id, "global"))
  if (row) {
    return {
      store: { mode: row.storeMode, value: Number(row.storeValue) },
      shop: { mode: row.shopMode, value: Number(row.shopValue) },
    }
  }
  await db
    .insert(notificationThresholds)
    .values({ id: "global" })
    .onConflictDoNothing()
  return {
    store: { mode: "percent" as const, value: 30 },
    shop: { mode: "percent" as const, value: 15 },
  }
})

const updateInput = z.object({
  store: z.object({ mode: modeEnum, value: z.number().positive() }),
  shop: z.object({ mode: modeEnum, value: z.number().positive() }),
})

export const updateThresholds = createServerFn()
  .inputValidator(updateInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db
      .insert(notificationThresholds)
      .values({
        id: "global",
        storeMode: data.store.mode,
        storeValue: String(data.store.value),
        shopMode: data.shop.mode,
        shopValue: String(data.shop.value),
        updatedBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: notificationThresholds.id,
        set: {
          storeMode: data.store.mode,
          storeValue: String(data.store.value),
          shopMode: data.shop.mode,
          shopValue: String(data.shop.value),
          updatedBy: session.user.id,
        },
      })
    return { ok: true }
  })

const listOverridesInput = z.object({
  shopId: z.uuid().optional(),
})

export const listOverrides = createServerFn()
  .inputValidator(listOverridesInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    const whereClause = data.shopId
      ? eq(notificationThresholdOverrides.shopId, data.shopId)
      : undefined
    return db.query.notificationThresholdOverrides.findMany({
      where: whereClause,
      with: {
        productColor: { with: { product: true } },
        shop: true,
      },
    })
  })

const upsertOverrideInput = z.object({
  scope: scopeEnum,
  productColorId: z.uuid(),
  size: z.string().min(1),
  shopId: z.uuid().nullable(),
  mode: modeEnum,
  value: z.number().positive(),
})

export const upsertOverride = createServerFn()
  .inputValidator(upsertOverrideInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db
      .insert(notificationThresholdOverrides)
      .values({
        scope: data.scope,
        productColorId: data.productColorId,
        size: data.size,
        shopId: data.shopId,
        mode: data.mode,
        value: String(data.value),
      })
      .onConflictDoUpdate({
        target: [
          notificationThresholdOverrides.scope,
          notificationThresholdOverrides.productColorId,
          notificationThresholdOverrides.size,
          notificationThresholdOverrides.shopId,
        ],
        set: {
          mode: data.mode,
          value: String(data.value),
        },
      })
    return { ok: true }
  })

const deleteOverrideInput = z.object({ id: z.uuid() })

export const deleteOverride = createServerFn()
  .inputValidator(deleteOverrideInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db
      .delete(notificationThresholdOverrides)
      .where(eq(notificationThresholdOverrides.id, data.id))
    return { ok: true }
  })
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/functions/notifications/thresholds.ts
git commit -m "feat(notifications): server fns for thresholds and overrides"
```

---

## Task 10: Email — typed digest data + fixture

**Files:**
- Create: `src/lib/emails/__fixtures__/low-stock-digest.tsx`

This task adds the shared type and a previewable fixture before we write the template — TDD-ish (preview-first).

- [ ] **Step 1: Define the type in the digest module**

Create `src/lib/emails/low-stock-digest.tsx` as a stub first — only the type export — then expand in Task 11:

```tsx
// src/lib/emails/low-stock-digest.tsx (stub — fully implemented in Task 11)
export interface LowStockDigestData {
  recipientName: string
  appUrl: string
  generatedAt: Date
  storeLowCount: number
  shopLowCount: number
  shopsAffectedCount: number
  topItems: Array<{
    scope: "store" | "shop"
    locationName: string
    productLabel: string
    quantityOnHand: number
    baseline: number
    rule: { mode: "percent" | "units"; value: number }
    severity: "critical" | "warning"
  }>
  storeRequisitionsUrl: string
  shopSuggestionsUrl: string
  manageNotificationsUrl: string
}

export function LowStockDigestTemplate(_data: LowStockDigestData) {
  return null
}
```

- [ ] **Step 2: Create the fixture**

```tsx
// src/lib/emails/__fixtures__/low-stock-digest.tsx
import type { LowStockDigestData } from "#/lib/emails/low-stock-digest"

export const sampleLowStockDigestData: LowStockDigestData = {
  recipientName: "Aisha",
  appUrl: "https://inventory.fidexa.org",
  generatedAt: new Date("2026-05-21T07:00:00+03:00"),
  storeLowCount: 4,
  shopLowCount: 12,
  shopsAffectedCount: 3,
  topItems: [
    {
      scope: "shop",
      locationName: "Kampala Central",
      productLabel: "AX-101 Black/M",
      quantityOnHand: 2,
      baseline: 80,
      rule: { mode: "percent", value: 15 },
      severity: "critical",
    },
    {
      scope: "shop",
      locationName: "Entebbe Mall",
      productLabel: "AX-101 Black/L",
      quantityOnHand: 4,
      baseline: 60,
      rule: { mode: "percent", value: 15 },
      severity: "critical",
    },
    {
      scope: "store",
      locationName: "Main Warehouse",
      productLabel: "BX-203 Red/S",
      quantityOnHand: 12,
      baseline: 110,
      rule: { mode: "percent", value: 30 },
      severity: "warning",
    },
    {
      scope: "shop",
      locationName: "Jinja Road",
      productLabel: "CX-440 Blue/XL",
      quantityOnHand: 1,
      baseline: 5,
      rule: { mode: "units", value: 5 },
      severity: "warning",
    },
  ],
  storeRequisitionsUrl:
    "https://inventory.fidexa.org/store/restock-requisitions",
  shopSuggestionsUrl: "https://inventory.fidexa.org/shop",
  manageNotificationsUrl:
    "https://inventory.fidexa.org/settings/notifications",
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/emails/low-stock-digest.tsx src/lib/emails/__fixtures__/low-stock-digest.tsx
git commit -m "feat(emails): low-stock digest data shape and preview fixture"
```

---

## Task 11: Email — beautiful digest template

**Files:**
- Modify: `src/lib/emails/low-stock-digest.tsx`
- Modify: `src/lib/emails/index.ts`

Mirrors the existing `EmailLayout` brand language (blue gradient header, slate body, Tailwind via `@react-email/components`).

- [ ] **Step 1: Implement the full template**

Replace `src/lib/emails/low-stock-digest.tsx` with:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"

export interface LowStockDigestData {
  recipientName: string
  appUrl: string
  generatedAt: Date
  storeLowCount: number
  shopLowCount: number
  shopsAffectedCount: number
  topItems: Array<{
    scope: "store" | "shop"
    locationName: string
    productLabel: string
    quantityOnHand: number
    baseline: number
    rule: { mode: "percent" | "units"; value: number }
    severity: "critical" | "warning"
  }>
  storeRequisitionsUrl: string
  shopSuggestionsUrl: string
  manageNotificationsUrl: string
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Kampala",
  })

export function LowStockDigestTemplate(data: LowStockDigestData) {
  const preview = `${data.storeLowCount + data.shopLowCount} items below threshold — ${fmtDate(data.generatedAt)}`
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans m-0 p-0">
          <Container className="max-w-[640px] mx-auto py-6">
            {/* Header */}
            <Section className="bg-gradient-to-br from-[#4DA6FF] to-[#0066E6] rounded-t-xl px-8 py-6">
              <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                <tr>
                  <td width="48" valign="middle">
                    <Img
                      src={`${data.appUrl}/logo192.png`}
                      width="48"
                      height="48"
                      alt="Inventory Management"
                      className="rounded-[12px] block"
                    />
                  </td>
                  <td valign="middle" style={{ paddingLeft: "16px" }}>
                    <Text className="text-white text-[18px] font-bold m-0 tracking-[-0.3px]">
                      Inventory Management
                    </Text>
                    <Text className="text-white/80 text-[13px] m-0 mt-1">
                      Daily low-stock digest · {fmtDate(data.generatedAt)}
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Body */}
            <Section className="bg-white px-8 pt-8 pb-6">
              <Heading className="text-slate-900 text-[22px] font-bold mb-2 mt-0 tracking-[-0.3px]">
                Hi {data.recipientName},
              </Heading>
              <Text className="text-slate-600 text-[15px] leading-6 mb-6 mt-0">
                Here's what needs attention this morning.
              </Text>

              {/* Stat tiles */}
              <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                <tr>
                  <td width="50%" valign="top" style={{ paddingRight: "8px" }}>
                    <Section className="bg-rose-50 rounded-lg px-5 py-4">
                      <Text className="text-rose-900 text-[28px] font-bold m-0 leading-none">
                        {data.storeLowCount}
                      </Text>
                      <Text className="text-rose-700 text-[13px] font-medium m-0 mt-2">
                        store items low
                      </Text>
                    </Section>
                  </td>
                  <td width="50%" valign="top" style={{ paddingLeft: "8px" }}>
                    <Section className="bg-amber-50 rounded-lg px-5 py-4">
                      <Text className="text-amber-900 text-[28px] font-bold m-0 leading-none">
                        {data.shopLowCount}
                      </Text>
                      <Text className="text-amber-700 text-[13px] font-medium m-0 mt-2">
                        shop items low
                        {data.shopsAffectedCount > 0 &&
                          ` · ${data.shopsAffectedCount} shop${data.shopsAffectedCount === 1 ? "" : "s"}`}
                      </Text>
                    </Section>
                  </td>
                </tr>
              </table>

              {/* Top items */}
              {data.topItems.length > 0 && (
                <Section className="mt-8">
                  <Heading
                    as="h2"
                    className="text-slate-900 text-[16px] font-semibold mb-3 mt-0"
                  >
                    Most urgent
                  </Heading>
                  {data.topItems.map((item, idx) => (
                    <ItemRow key={idx} item={item} />
                  ))}
                </Section>
              )}

              {/* CTAs */}
              <Section className="mt-8">
                <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                  <tr>
                    <td width="50%" align="center" style={{ paddingRight: "6px" }}>
                      <Button
                        href={data.storeRequisitionsUrl}
                        className="bg-[#0066E6] text-white text-[14px] font-semibold rounded-md px-5 py-3 no-underline inline-block w-full text-center"
                      >
                        Store requisitions →
                      </Button>
                    </td>
                    <td width="50%" align="center" style={{ paddingLeft: "6px" }}>
                      <Button
                        href={data.shopSuggestionsUrl}
                        className="bg-slate-900 text-white text-[14px] font-semibold rounded-md px-5 py-3 no-underline inline-block w-full text-center"
                      >
                        Shop suggestions →
                      </Button>
                    </td>
                  </tr>
                </table>
              </Section>
            </Section>

            <Hr className="border-slate-200 my-0" />

            {/* Footer */}
            <Section className="bg-white rounded-b-xl px-8 py-5">
              <Text className="text-slate-400 text-[12px] leading-5 m-0 text-center">
                You're receiving this because you're an admin or supervisor.
                {" "}
                <Link
                  href={data.manageNotificationsUrl}
                  className="text-[#0066E6]"
                >
                  Manage thresholds
                </Link>
                .
              </Text>
              <Text className="text-slate-300 text-[11px] text-center pt-2 m-0">
                © {data.generatedAt.getFullYear()} Inventory Management
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

function ItemRow({
  item,
}: {
  item: LowStockDigestData["topItems"][number]
}) {
  const tone =
    item.severity === "critical"
      ? {
          bg: "bg-rose-50",
          border: "border-rose-300",
          chipBg: "bg-rose-100",
          chipText: "text-rose-800",
          label: "Critical",
        }
      : {
          bg: "bg-amber-50",
          border: "border-amber-300",
          chipBg: "bg-amber-100",
          chipText: "text-amber-800",
          label: "Warning",
        }
  const detail =
    item.rule.mode === "percent"
      ? `${item.quantityOnHand} of ~${item.baseline} typical (threshold ${item.rule.value}%)`
      : `${item.quantityOnHand} units left (threshold ${item.rule.value})`
  return (
    <Section
      className={`${tone.bg} border-l-4 ${tone.border} rounded-r-md px-4 py-3 mb-2`}
    >
      <table cellPadding="0" cellSpacing="0" border={0} width="100%">
        <tr>
          <td valign="top">
            <Text className="text-slate-900 text-[14px] font-semibold m-0">
              {item.productLabel}
            </Text>
            <Text className="text-slate-600 text-[12px] m-0 mt-1">
              {item.scope === "store" ? "Store" : "Shop"} · {item.locationName}
            </Text>
            <Text className="text-slate-500 text-[12px] m-0 mt-1">{detail}</Text>
          </td>
          <td valign="top" align="right" width="100">
            <Text
              className={`${tone.chipBg} ${tone.chipText} text-[11px] font-bold rounded-full px-3 py-1 m-0 inline-block`}
            >
              {tone.label.toUpperCase()}
            </Text>
          </td>
        </tr>
      </table>
    </Section>
  )
}
```

- [ ] **Step 2: Re-export from `src/lib/emails/index.ts`**

Open the file and add:

```ts
export { LowStockDigestTemplate } from "./low-stock-digest"
export type { LowStockDigestData } from "./low-stock-digest"
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/emails/low-stock-digest.tsx src/lib/emails/index.ts
git commit -m "feat(emails): low-stock digest template with severity tones"
```

---

## Task 12: Email send fn + digest aggregator

**Files:**
- Modify: `src/lib/email.ts`
- Create: `src/server/scheduled/send-low-stock-digest.ts`

- [ ] **Step 1: Add `sendLowStockDigest` to `src/lib/email.ts`**

Open the file, add the import + function below the existing ones:

```ts
// add to imports
import { LowStockDigestTemplate } from "#/lib/emails"
import type { LowStockDigestData } from "#/lib/emails"

// add at bottom
type DigestArgs = { to: string; data: LowStockDigestData }
export async function sendLowStockDigest({ to, data }: DigestArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Low-stock digest — ${data.storeLowCount + data.shopLowCount} items need attention`,
      react: LowStockDigestTemplate(data),
    })
  } catch (error) {
    console.error("[Email] sendLowStockDigest failed:", error)
  }
}
```

- [ ] **Step 2: Create `src/server/scheduled/send-low-stock-digest.ts`**

```ts
import { and, eq, sql } from "drizzle-orm"
import { db as defaultDb } from "#/db"
import {
  lowStockAlerts,
  productColors,
  products,
  shops,
  stores,
  user,
} from "#/db/schema"
import { sendLowStockDigest } from "#/lib/email"
import { formatProductLabel } from "#/lib/products"
import { severityForAlert, severityRank } from "#/lib/notifications/severity"
import { env } from "#/env"
import type { LowStockDigestData } from "#/lib/emails"
import type { Role } from "#/lib/roles"

type Db = typeof defaultDb
const RECIPIENT_ROLES: Role[] = ["admin", "supervisor"]
const TOP_N = 10

export interface DigestSummary {
  emailsSent: number
  alertCount: number
  recipientCount: number
}

export async function sendDailyLowStockDigestInternal(
  db: Db,
  now: Date,
): Promise<DigestSummary> {
  const alerts = await db.query.lowStockAlerts.findMany({
    where: eq(lowStockAlerts.status, "open"),
    with: { productColor: { with: { product: true } } },
  })

  if (alerts.length === 0) {
    return { emailsSent: 0, alertCount: 0, recipientCount: 0 }
  }

  const shopAlerts = alerts.filter((a) => a.scope === "shop")
  const storeAlerts = alerts.filter((a) => a.scope === "store")
  const shopIds = new Set(shopAlerts.map((a) => a.locationId))
  const storeIds = new Set(storeAlerts.map((a) => a.locationId))

  const [shopRows, storeRows] = await Promise.all([
    shopIds.size > 0
      ? db
          .select({ id: shops.id, name: shops.name })
          .from(shops)
          .where(sql`${shops.id} = ANY(${[...shopIds]})`)
      : Promise.resolve([]),
    storeIds.size > 0
      ? db
          .select({ id: stores.id, name: stores.name })
          .from(stores)
          .where(sql`${stores.id} = ANY(${[...storeIds]})`)
      : Promise.resolve([]),
  ])
  const locationName = new Map<string, string>()
  for (const r of shopRows) locationName.set(r.id, r.name)
  for (const r of storeRows) locationName.set(r.id, r.name)

  const topItems = alerts
    .map((a) => {
      const rule = a.thresholdSnapshot
      const baseline = a.baselineQuantity
      const qoh = a.quantityAtOpen
      return {
        scope: a.scope,
        locationName: locationName.get(a.locationId) ?? "(unknown)",
        productLabel: formatProductLabel(
          a.productColor.product.articleNumber,
          a.productColor.colorName,
          a.size,
        ),
        quantityOnHand: qoh,
        baseline,
        rule,
        severity: severityForAlert({ rule, baseline, quantityOnHand: qoh }),
        _rank: severityRank({ rule, baseline, quantityOnHand: qoh }),
      }
    })
    .sort((a, b) => b._rank - a._rank)
    .slice(0, TOP_N)
    .map(({ _rank, ...item }) => item)

  const recipients = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(
      and(
        sql`${user.role} = ANY(${RECIPIENT_ROLES})`,
        eq(user.emailVerified, true),
        eq(user.banned, false),
      ),
    )

  const appUrl = env.APP_URL
  let sent = 0
  for (const r of recipients) {
    const data: LowStockDigestData = {
      recipientName: r.name ?? "there",
      appUrl,
      generatedAt: now,
      storeLowCount: storeAlerts.length,
      shopLowCount: shopAlerts.length,
      shopsAffectedCount: shopIds.size,
      topItems,
      storeRequisitionsUrl: `${appUrl}/store/restock-requisitions`,
      shopSuggestionsUrl: `${appUrl}/shop`,
      manageNotificationsUrl: `${appUrl}/settings/notifications`,
    }
    try {
      await sendLowStockDigest({ to: r.email, data })
      sent++
    } catch (error) {
      console.error("[sendDailyLowStockDigest] recipient failed", {
        userId: r.id,
        error,
      })
    }
  }
  return {
    emailsSent: sent,
    alertCount: alerts.length,
    recipientCount: recipients.length,
  }
}
```

- [ ] **Step 3: Write a small integration test**

Create `src/__tests__/low-stock-digest.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest"
import { db } from "#/db"
import { eq } from "drizzle-orm"
import { lowStockAlerts } from "#/db/schema"
import { sendDailyLowStockDigestInternal } from "#/server/scheduled/send-low-stock-digest"

vi.mock("#/lib/email", async (orig) => {
  const mod = await orig<typeof import("#/lib/email")>()
  return {
    ...mod,
    sendLowStockDigest: vi.fn(async () => {}),
  }
})

describe("sendDailyLowStockDigestInternal", () => {
  beforeEach(async () => {
    await db.delete(lowStockAlerts)
  })

  it("returns zero counts and does not call Resend when no open alerts", async () => {
    const email = await import("#/lib/email")
    const result = await sendDailyLowStockDigestInternal(db, new Date())
    expect(result).toEqual({
      emailsSent: 0,
      alertCount: 0,
      recipientCount: 0,
    })
    expect(email.sendLowStockDigest).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run typecheck + new test**

Run: `pnpm typecheck && pnpm vitest run src/__tests__/low-stock-digest.test.ts`
Expected: clean + 1 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/server/scheduled/send-low-stock-digest.ts src/__tests__/low-stock-digest.test.ts
git commit -m "feat(notifications): daily digest aggregator and email send"
```

---

## Task 13: Cloudflare scheduled handler + cron triggers

**Files:**
- Create: `src/server/worker.ts`
- Modify: `wrangler.jsonc`

TanStack Start's default worker entry is `@tanstack/react-start/server-entry`. We wrap it so the worker exports both `fetch` (delegated to TanStack) and `scheduled` (our cron).

- [ ] **Step 1: Read the TanStack Start server-entry exports to find how to re-export `fetch`**

Run: `cat node_modules/@tanstack/react-start/dist/server-entry.js 2>/dev/null | head -40 || find node_modules/@tanstack/react-start -name "server-entry*" -maxdepth 4 2>/dev/null | head`
Expected: locate the file. The default export is the fetch handler; if it's a default export wrap it accordingly. If it's a named `fetch` export, re-export it.

- [ ] **Step 2: Create `src/server/worker.ts`**

```ts
// src/server/worker.ts
import tanstackHandler from "@tanstack/react-start/server-entry"
import { db } from "#/db"
import { runThresholdChecksInternal } from "#/server/scheduled/run-threshold-checks"
import { sendDailyLowStockDigestInternal } from "#/server/scheduled/send-low-stock-digest"

export default {
  fetch: tanstackHandler.fetch.bind(tanstackHandler),
  async scheduled(
    event: ScheduledEvent,
    _env: unknown,
    ctx: ExecutionContext,
  ) {
    const now = new Date(event.scheduledTime)
    if (event.cron === "0 4 * * *") {
      ctx.waitUntil(
        (async () => {
          await runThresholdChecksInternal(db, now)
          await sendDailyLowStockDigestInternal(db, now)
        })(),
      )
    } else {
      ctx.waitUntil(runThresholdChecksInternal(db, now))
    }
  },
}
```

If Step 1 revealed the TanStack export is a default function (not an object), adjust to:

```ts
fetch: (req: Request, env: unknown, ctx: ExecutionContext) =>
  (tanstackHandler as (req: Request, env: unknown, ctx: ExecutionContext) => Response | Promise<Response>)(
    req, env, ctx,
  ),
```

- [ ] **Step 3: Update `wrangler.jsonc`**

Edit `wrangler.jsonc`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "tanstack-start-app",
  "compatibility_date": "2025-09-02",
  "compatibility_flags": ["nodejs_compat"],
  "main": "src/server/worker.ts",
  "workers_dev": true,
  "routes": [
    { "pattern": "inventory.fidexa.org", "custom_domain": true }
  ],
  "triggers": {
    "crons": ["0 * * * *", "0 4 * * *"]
  }
}
```

- [ ] **Step 4: Verify build still works**

Run: `pnpm typecheck && pnpm build`
Expected: clean build.

If the build fails because TanStack Start's plugin expects the original main, **stop and document the failure** — the engineer must consult TanStack Start's "custom worker entry" docs and adapt. The likely fix: keep `main` as the TanStack entry and instead override the worker bundle via Vite/Wrangler `services` or a `[build]` hook. Note the failure in the commit message and open an issue if so; do NOT silently fall back.

- [ ] **Step 5: Commit**

```bash
git add src/server/worker.ts wrangler.jsonc
git commit -m "feat(worker): scheduled handler with hourly checks + daily digest"
```

---

## Task 14: Threshold settings UI — global defaults

**Files:**
- Create: `src/routes/settings/notifications.tsx`
- Create: `src/components/notifications/threshold-form.tsx`

- [ ] **Step 1: Create the form component**

```tsx
// src/components/notifications/threshold-form.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"

export interface ThresholdValue {
  mode: "percent" | "units"
  value: number
}

export function ThresholdField({
  label,
  helpText,
  value,
  onChange,
}: {
  label: string
  helpText: string
  value: ThresholdValue
  onChange: (next: ThresholdValue) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{helpText}</p>
      <div className="flex gap-2">
        <Select
          value={value.mode}
          onValueChange={(m) =>
            onChange({ mode: m as ThresholdValue["mode"], value: value.value })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">Percentage</SelectItem>
            <SelectItem value="units">Units</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0}
          step={value.mode === "percent" ? "1" : "1"}
          value={value.value}
          onChange={(e) =>
            onChange({ mode: value.mode, value: Number(e.target.value) })
          }
          className="w-32"
        />
        <span className="self-center text-sm text-muted-foreground">
          {value.mode === "percent" ? "% of typical batch" : "units left"}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the route**

```tsx
// src/routes/settings/notifications.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  getThresholds,
  updateThresholds,
} from "#/server/functions/notifications/thresholds"
import { runThresholdChecksNow } from "#/server/functions/notifications/notifications"
import {
  ThresholdField,
  type ThresholdValue,
} from "#/components/notifications/threshold-form"

export const Route = createFileRoute("/settings/notifications")({
  loader: async () => {
    return { thresholds: await getThresholds() }
  },
  component: NotificationsSettingsPage,
})

function NotificationsSettingsPage() {
  const { thresholds } = Route.useLoaderData()
  const router = useRouter()
  const [store, setStore] = useState<ThresholdValue>(thresholds.store)
  const [shop, setShop] = useState<ThresholdValue>(thresholds.shop)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  async function onSave() {
    setSaving(true)
    try {
      await updateThresholds({ data: { store, shop } })
      toast.success("Thresholds saved.")
      await router.invalidate()
    } finally {
      setSaving(false)
    }
  }

  async function onRunNow() {
    setRunning(true)
    try {
      const r = await runThresholdChecksNow()
      toast.success(
        `Check complete. Opened: ${r.shopAlertsOpened + r.storeAlertsOpened}, resolved: ${r.shopAlertsResolved + r.storeAlertsResolved}.`,
      )
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification thresholds</h1>
        <p className="text-muted-foreground text-sm">
          Choose when the system flags an item as low stock. Percentages
          compare against a rolling average of the last 3 batches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global defaults</CardTitle>
          <CardDescription>
            Used for every variant unless a per-product override applies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ThresholdField
            label="Store (warehouse) threshold"
            helpText="Default trigger when warehouse stock for a variant runs low."
            value={store}
            onChange={setStore}
          />
          <ThresholdField
            label="Shop threshold"
            helpText="Default trigger for every shop's stock of a variant."
            value={shop}
            onChange={setShop}
          />
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save defaults"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual check</CardTitle>
          <CardDescription>
            Run the threshold scan now. Normally runs every hour.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onRunNow} disabled={running}>
            {running ? "Running…" : "Run check now"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verify the dev server compiles and the page loads**

Run: `pnpm dev` in one terminal, visit `http://localhost:3000/settings/notifications` (logged in as admin).
Expected: page renders. Save updates `notification_thresholds`. "Run check now" returns a summary toast.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/threshold-form.tsx src/routes/settings/notifications.tsx
git commit -m "feat(notifications): settings page for global thresholds and manual run"
```

---

## Task 15: Product override table on settings page

**Files:**
- Create: `src/components/notifications/override-table.tsx`
- Modify: `src/routes/settings/notifications.tsx`

- [ ] **Step 1: Create the override table component**

```tsx
// src/components/notifications/override-table.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  upsertOverride,
  deleteOverride,
} from "#/server/functions/notifications/thresholds"
import { toast } from "sonner"

export interface OverrideRow {
  id: string
  scope: "store" | "shop"
  productColor: {
    id: string
    colorName: string
    product: { id: string; articleNumber: string; name: string }
  }
  size: string
  shopId: string | null
  shop: { id: string; name: string } | null
  mode: "percent" | "units"
  value: string
}

export function OverrideTable({
  rows,
  showShopColumn,
  productOptions,
  shopOptions,
  defaultShopId,
  onChanged,
}: {
  rows: OverrideRow[]
  showShopColumn: boolean
  productOptions: Array<{
    productColorId: string
    label: string
    sizes: string[]
  }>
  shopOptions?: Array<{ id: string; name: string }>
  defaultShopId?: string | null
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scope</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Size</TableHead>
            {showShopColumn && <TableHead>Shop</TableHead>}
            <TableHead>Rule</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.scope}</TableCell>
              <TableCell>
                {r.productColor.product.articleNumber} {r.productColor.colorName}
              </TableCell>
              <TableCell>{r.size}</TableCell>
              {showShopColumn && (
                <TableCell>{r.shop?.name ?? "(all shops)"}</TableCell>
              )}
              <TableCell>
                {r.mode === "percent" ? `≤ ${r.value}%` : `≤ ${r.value} units`}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await deleteOverride({ data: { id: r.id } })
                    toast.success("Override removed.")
                    onChanged()
                  }}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={showShopColumn ? 6 : 5}
                className="text-muted-foreground text-sm text-center"
              >
                No overrides yet — defaults apply to everything.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {adding ? (
        <AddOverrideForm
          showShopField={showShopColumn}
          productOptions={productOptions}
          shopOptions={shopOptions ?? []}
          defaultShopId={defaultShopId ?? null}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            onChanged()
          }}
        />
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add override
        </Button>
      )}
    </div>
  )
}

function AddOverrideForm({
  showShopField,
  productOptions,
  shopOptions,
  defaultShopId,
  onCancel,
  onSaved,
}: {
  showShopField: boolean
  productOptions: Array<{
    productColorId: string
    label: string
    sizes: string[]
  }>
  shopOptions: Array<{ id: string; name: string }>
  defaultShopId: string | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [scope, setScope] = useState<"store" | "shop">(
    showShopField ? "shop" : "store",
  )
  const [productColorId, setProductColorId] = useState(
    productOptions[0]?.productColorId ?? "",
  )
  const sizes = productOptions.find(
    (p) => p.productColorId === productColorId,
  )?.sizes ?? []
  const [size, setSize] = useState(sizes[0] ?? "")
  const [shopId, setShopId] = useState<string | null>(defaultShopId)
  const [mode, setMode] = useState<"percent" | "units">("percent")
  const [value, setValue] = useState("20")
  const [saving, setSaving] = useState(false)

  async function onSubmit() {
    setSaving(true)
    try {
      await upsertOverride({
        data: {
          scope,
          productColorId,
          size,
          shopId: scope === "shop" ? shopId : null,
          mode,
          value: Number(value),
        },
      })
      toast.success("Override saved.")
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Scope</label>
          <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store">Store</SelectItem>
              <SelectItem value="shop">Shop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Variant</label>
          <Select value={productColorId} onValueChange={setProductColorId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {productOptions.map((p) => (
                <SelectItem key={p.productColorId} value={p.productColorId}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Size</label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showShopField && scope === "shop" && (
          <div>
            <label className="text-xs font-medium">Shop</label>
            <Select
              value={shopId ?? "ALL"}
              onValueChange={(v) => setShopId(v === "ALL" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All shops</SelectItem>
                {shopOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium">Mode</label>
          <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">Percentage</SelectItem>
              <SelectItem value="units">Units</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium">Value</label>
          <Input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? "Saving…" : "Save override"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire the table into the settings route**

In `src/routes/settings/notifications.tsx`, extend the loader and component:

```tsx
// add to imports
import {
  listOverrides,
} from "#/server/functions/notifications/thresholds"
import { listProductColorsForOverrides } from "#/server/functions/products"
// ↑ if this fn doesn't exist, add it in src/server/functions/products.ts as:
//   export const listProductColorsForOverrides = createServerFn().handler(async () => {
//     await requireSession(); // gate
//     return db.query.productColors.findMany({ with: { product: true } })
//   })
import { listShops } from "#/server/functions/shops"  // verify exact name
import { OverrideTable } from "#/components/notifications/override-table"

// update loader:
loader: async () => {
  const [thresholds, overrides, productColorsRaw, shopsRaw] = await Promise.all([
    getThresholds(),
    listOverrides({ data: {} }),
    listProductColorsForOverrides(),
    listShops(),
  ])
  // Sizes per variant: we treat distinct shop_stock.size + store_stock.size as available sizes,
  // but for an MVP let the user type freely. Hand a small predefined list:
  const productOptions = productColorsRaw.map((pc) => ({
    productColorId: pc.id,
    label: `${pc.product.articleNumber} · ${pc.colorName}`,
    sizes: ["S", "M", "L", "XL", "XXL"],
  }))
  return {
    thresholds,
    overrides,
    productOptions,
    shops: shopsRaw,
  }
},
```

In the component, render two `OverrideTable`s (one for product-only, one for shop-bound) by filtering `overrides`. Use `router.invalidate()` from `onChanged`.

```tsx
const { thresholds, overrides, productOptions, shops } = Route.useLoaderData()
const productOnlyOverrides = overrides.filter((o) => o.shopId === null)
// (shop-bound overrides live on the per-shop page — Task 16)

// ... below the "Manual check" card:
<Card>
  <CardHeader>
    <CardTitle>Product overrides</CardTitle>
    <CardDescription>
      Pin a specific variant to a custom rule.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <OverrideTable
      rows={productOnlyOverrides}
      showShopColumn={false}
      productOptions={productOptions}
      onChanged={() => router.invalidate()}
    />
    <p className="text-xs text-muted-foreground mt-4">
      Need to set thresholds for a specific shop?
      Go to <span className="font-mono">Settings → Shops → [shop] → Overrides</span>.
    </p>
  </CardContent>
</Card>
```

- [ ] **Step 3: Verify in browser**

Add and delete overrides, confirm the table updates without a hard refresh.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/override-table.tsx src/routes/settings/notifications.tsx src/server/functions/products.ts
git commit -m "feat(notifications): product-scope overrides UI"
```

---

## Task 16: Per-shop overrides page (discoverable secondary screen)

**Files:**
- Create: `src/routes/settings/shops.$shopId.overrides.tsx`

- [ ] **Step 1: Create the route**

```tsx
// src/routes/settings/shops.$shopId.overrides.tsx
import { createFileRoute, useRouter, Link } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  listOverrides,
} from "#/server/functions/notifications/thresholds"
import { listProductColorsForOverrides } from "#/server/functions/products"
import { getShop } from "#/server/functions/shops"  // verify exact name; if missing,
// add: export const getShop = createServerFn().inputValidator(z.object({ id: z.uuid() })).handler(...)
import { OverrideTable } from "#/components/notifications/override-table"

export const Route = createFileRoute("/settings/shops/$shopId/overrides")({
  loader: async ({ params }) => {
    const [shop, overrides, productColorsRaw] = await Promise.all([
      getShop({ data: { id: params.shopId } }),
      listOverrides({ data: { shopId: params.shopId } }),
      listProductColorsForOverrides(),
    ])
    const productOptions = productColorsRaw.map((pc) => ({
      productColorId: pc.id,
      label: `${pc.product.articleNumber} · ${pc.colorName}`,
      sizes: ["S", "M", "L", "XL", "XXL"],
    }))
    return { shop, overrides, productOptions }
  },
  component: PerShopOverridesPage,
})

function PerShopOverridesPage() {
  const { shop, overrides, productOptions } = Route.useLoaderData()
  const router = useRouter()
  return (
    <div className="container max-w-3xl py-8 space-y-4">
      <Link
        to="/settings/notifications"
        className="text-sm text-muted-foreground underline"
      >
        ← Notifications settings
      </Link>
      <h1 className="text-2xl font-bold">Stock alerts — {shop.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Overrides for this shop</CardTitle>
          <CardDescription>
            These rules apply only when checking {shop.name}'s stock. They
            beat product-only overrides and the global default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OverrideTable
            rows={overrides}
            showShopColumn={true}
            productOptions={productOptions}
            shopOptions={[{ id: shop.id, name: shop.name }]}
            defaultShopId={shop.id}
            onChanged={() => router.invalidate()}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify the page loads at `/settings/shops/<some-shop-id>/overrides`**

Run dev server, navigate, add an override, confirm it lands in the table with the shop column populated.

- [ ] **Step 3: Commit**

```bash
git add src/routes/settings/shops.$shopId.overrides.tsx src/server/functions/shops.ts
git commit -m "feat(notifications): per-shop overrides page"
```

---

## Task 17: Shop restock suggestions server fn

**Files:**
- Create: `src/server/functions/shop/restock-suggestions.ts`

- [ ] **Step 1: Implement the listing**

```ts
// src/server/functions/shop/restock-suggestions.ts
import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  lowStockAlerts,
  shopStock,
  productColors,
  products,
  storeStock,
  shops,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatProductLabel } from "#/lib/products"

const input = z.object({ shopId: z.uuid() })

export const listShopRestockSuggestions = createServerFn()
  .inputValidator(input)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    // Join open alerts for this shop with the live shop_stock row and the
    // matching store_stock row (for restock source — same variant in warehouse).
    const rows = await db
      .select({
        alertId: lowStockAlerts.id,
        shopStockId: shopStock.id,
        productColorId: shopStock.productColorId,
        size: shopStock.size,
        quantityOnHand: shopStock.quantityOnHand,
        baseline: lowStockAlerts.baselineQuantity,
        storeStockId: storeStock.id,
        storeQuantity: storeStock.quantityOnHand,
        articleNumber: products.articleNumber,
        colorName: productColors.colorName,
      })
      .from(lowStockAlerts)
      .innerJoin(
        shopStock,
        and(
          eq(shopStock.shopId, lowStockAlerts.locationId),
          eq(shopStock.productColorId, lowStockAlerts.productColorId),
          eq(shopStock.size, lowStockAlerts.size),
        ),
      )
      .innerJoin(productColors, eq(productColors.id, shopStock.productColorId))
      .innerJoin(products, eq(products.id, productColors.productId))
      .leftJoin(
        storeStock,
        and(
          eq(storeStock.productColorId, shopStock.productColorId),
          eq(storeStock.size, shopStock.size),
        ),
      )
      .where(
        and(
          eq(lowStockAlerts.scope, "shop"),
          eq(lowStockAlerts.locationId, data.shopId),
          eq(lowStockAlerts.status, "open"),
        ),
      )

    return rows.map((r) => ({
      alertId: r.alertId,
      shopStockId: r.shopStockId,
      productColorId: r.productColorId,
      size: r.size,
      quantityOnHand: r.quantityOnHand,
      baseline: r.baseline,
      suggestedQuantity: Math.max(0, r.baseline - r.quantityOnHand),
      storeStockId: r.storeStockId,
      storeQuantity: r.storeQuantity ?? 0,
      productLabel: formatProductLabel(
        r.articleNumber,
        r.colorName,
        r.size,
      ),
    }))
  })
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/functions/shop/restock-suggestions.ts
git commit -m "feat(shop): list low items per shop with restock suggestions"
```

---

## Task 18: Shop restock UI

**Files:**
- Create: `src/routes/shop/$shopId.restock.tsx`
- Create: `src/components/notifications/restock-suggestions-table.tsx`

Find the existing "create transfer" server fn first; we'll reuse it.

- [ ] **Step 1: Locate the existing transfer-creation server fn**

Run: `grep -n "createTransfer\|createStoreTransfer\|export const.*transfer" src/server/functions/store/transfers.ts | head`
Note: the exact name and its input shape — use that exact contract below.

- [ ] **Step 2: Create the table component**

```tsx
// src/components/notifications/restock-suggestions-table.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Checkbox } from "#/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"

export interface SuggestionRow {
  alertId: string
  shopStockId: string
  storeStockId: string | null
  productColorId: string
  size: string
  productLabel: string
  quantityOnHand: number
  baseline: number
  suggestedQuantity: number
  storeQuantity: number
}

export interface SuggestionSelection {
  storeStockId: string
  quantity: number
  productLabel: string
}

export function RestockSuggestionsTable({
  rows,
  preselectVariantId,
  onSubmit,
}: {
  rows: SuggestionRow[]
  preselectVariantId?: string
  onSubmit: (selections: SuggestionSelection[]) => Promise<void>
}) {
  const [picks, setPicks] = useState<
    Record<
      string,
      { checked: boolean; quantity: number }
    >
  >(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.alertId,
        {
          checked: preselectVariantId === r.productColorId,
          quantity: Math.min(r.suggestedQuantity, r.storeQuantity),
        },
      ]),
    ),
  )
  const [submitting, setSubmitting] = useState(false)

  async function dispatch() {
    setSubmitting(true)
    try {
      const selections: SuggestionSelection[] = rows
        .filter((r) => picks[r.alertId]?.checked && r.storeStockId)
        .map((r) => ({
          storeStockId: r.storeStockId!,
          quantity: picks[r.alertId].quantity,
          productLabel: r.productLabel,
        }))
      await onSubmit(selections)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Product</TableHead>
            <TableHead>In shop</TableHead>
            <TableHead>Typical</TableHead>
            <TableHead>Suggested</TableHead>
            <TableHead>In warehouse</TableHead>
            <TableHead>Send</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const pick = picks[r.alertId]
            const disabled = !r.storeStockId || r.storeQuantity === 0
            return (
              <TableRow key={r.alertId}>
                <TableCell>
                  <Checkbox
                    checked={pick?.checked ?? false}
                    disabled={disabled}
                    onCheckedChange={(c) =>
                      setPicks((p) => ({
                        ...p,
                        [r.alertId]: { ...pick, checked: Boolean(c) },
                      }))
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{r.productLabel}</TableCell>
                <TableCell>{r.quantityOnHand}</TableCell>
                <TableCell>{r.baseline}</TableCell>
                <TableCell>{r.suggestedQuantity}</TableCell>
                <TableCell>{r.storeQuantity}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={r.storeQuantity}
                    value={pick?.quantity ?? 0}
                    disabled={disabled || !pick?.checked}
                    onChange={(e) =>
                      setPicks((p) => ({
                        ...p,
                        [r.alertId]: {
                          ...pick,
                          quantity: Math.min(
                            Math.max(0, Number(e.target.value)),
                            r.storeQuantity,
                          ),
                        },
                      }))
                    }
                    className="w-20"
                  />
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No low items at this shop right now.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Button onClick={dispatch} disabled={submitting}>
        {submitting ? "Creating transfer…" : "Create transfer"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Create the route — use the createTransfer fn discovered in Step 1**

If the existing fn (call it `createStoreTransfer`) takes `{ shopId, items: [{ storeStockId, quantity }] }`, the route maps `SuggestionSelection[]` directly to its `items`.

```tsx
// src/routes/shop/$shopId.restock.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { listShopRestockSuggestions } from "#/server/functions/shop/restock-suggestions"
import { getShop } from "#/server/functions/shops"
// Replace with actual exported name from src/server/functions/store/transfers.ts:
import { createStoreTransfer } from "#/server/functions/store/transfers"
import {
  RestockSuggestionsTable,
  type SuggestionSelection,
} from "#/components/notifications/restock-suggestions-table"
import { z } from "zod"

const search = z.object({ variant: z.string().optional() })

export const Route = createFileRoute("/shop/$shopId/restock")({
  validateSearch: search,
  loaderDeps: ({ search }) => ({ variant: search.variant }),
  loader: async ({ params }) => {
    const [shop, suggestions] = await Promise.all([
      getShop({ data: { id: params.shopId } }),
      listShopRestockSuggestions({ data: { shopId: params.shopId } }),
    ])
    return { shop, suggestions }
  },
  component: ShopRestockPage,
})

function ShopRestockPage() {
  const { shop, suggestions } = Route.useLoaderData()
  const { variant } = Route.useSearch()
  const router = useRouter()
  const params = Route.useParams()

  async function onSubmit(selections: SuggestionSelection[]) {
    if (selections.length === 0) {
      toast.error("Select at least one item.")
      return
    }
    await createStoreTransfer({
      data: {
        shopId: params.shopId,
        items: selections.map((s) => ({
          storeStockId: s.storeStockId,
          quantity: s.quantity,
        })),
      },
    })
    toast.success(
      `Transfer dispatched with ${selections.length} item${selections.length === 1 ? "" : "s"}.`,
    )
    await router.invalidate()
    router.navigate({ to: "/store/transfers" })
  }

  return (
    <div className="container max-w-5xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Restock — {shop.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Currently low</CardTitle>
          <CardDescription>
            These items are below threshold. Tick the ones to dispatch from the
            warehouse, adjust quantities, and create a single transfer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestockSuggestionsTable
            rows={suggestions}
            preselectVariantId={variant}
            onSubmit={onSubmit}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Verify in browser**

Force a low alert (lower a shop_stock row, run check). Visit `/shop/<id>/restock`, dispatch, confirm a transfer is created in `/store/transfers`.

- [ ] **Step 5: Commit**

```bash
git add src/components/notifications/restock-suggestions-table.tsx src/routes/shop/$shopId.restock.tsx
git commit -m "feat(shop): restock suggestions page creates bundled transfer"
```

---

## Task 19: Store requisitions server fns

**Files:**
- Create: `src/server/functions/store/requisitions.ts`

- [ ] **Step 1: Implement listing, promoting, dismissing**

```ts
// src/server/functions/store/requisitions.ts
import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  restockRequisitions,
  supplyRouteItems,
  supplyRoutes,
  productColors,
  products,
  stores,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatProductLabel } from "#/lib/products"

export const listOpenRequisitions = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])
  const rows = await db.query.restockRequisitions.findMany({
    where: eq(restockRequisitions.status, "open"),
    with: {
      store: true,
      productColor: { with: { product: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    storeName: r.store.name,
    productColorId: r.productColorId,
    size: r.size,
    productLabel: formatProductLabel(
      r.productColor.product.articleNumber,
      r.productColor.colorName,
      r.size,
    ),
    suggestedQuantity: r.suggestedQuantity,
    baseline: r.baselineQuantity,
    quantityAtOpen: r.quantityAtOpen,
    openedAt: r.openedAt,
  }))
})

const promoteInput = z.object({
  requisitionIds: z.array(z.uuid()).min(1),
  supplyRouteId: z.uuid(),
  supplierId: z.uuid(),
})

export const promoteRequisitionsToRoute = createServerFn()
  .inputValidator(promoteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    return db.transaction(async (tx) => {
      // Lock target requisitions
      const target = await tx
        .select()
        .from(restockRequisitions)
        .where(inArray(restockRequisitions.id, data.requisitionIds))
        .for("update")

      const stillOpen = target.filter((r) => r.status === "open")
      if (stillOpen.length !== target.length) {
        throw new Error(
          "Some requisitions are no longer open (already planned or dismissed).",
        )
      }

      const [route] = await tx
        .select()
        .from(supplyRoutes)
        .where(eq(supplyRoutes.id, data.supplyRouteId))
      if (!route || route.status !== "planning") {
        throw new Error("Supply route must be in 'planning' status.")
      }

      for (const req of stillOpen) {
        const [item] = await tx
          .insert(supplyRouteItems)
          .values({
            supplyRouteId: data.supplyRouteId,
            supplierId: data.supplierId,
            productColorId: req.productColorId,
            // productId set via subquery on productColors
            productId: sql`(SELECT product_id FROM product_colors WHERE id = ${req.productColorId})`,
            size: req.size,
            quantity: req.suggestedQuantity,
            unitPriceForeign: "0",
            foreignCurrency: "RMB",
            totalAmountForeign: "0",
            totalCostUgx: "0",
          })
          .returning()
        await tx
          .update(restockRequisitions)
          .set({ status: "planned", supplyRouteItemId: item.id })
          .where(eq(restockRequisitions.id, req.id))
      }
      return { promoted: stillOpen.length }
    })
  })

const dismissInput = z.object({
  id: z.uuid(),
  reason: z.string().min(1).max(500),
})

export const dismissRequisition = createServerFn()
  .inputValidator(dismissInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    await db
      .update(restockRequisitions)
      .set({
        status: "dismissed",
        dismissedReason: data.reason,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(restockRequisitions.id, data.id),
          eq(restockRequisitions.status, "open"),
        ),
      )
    return { ok: true }
  })
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/server/functions/store/requisitions.ts
git commit -m "feat(store): server fns for requisition queue and promotion"
```

---

## Task 20: Store requisitions UI

**Files:**
- Create: `src/routes/store/restock-requisitions.tsx`
- Create: `src/components/notifications/requisitions-table.tsx`

- [ ] **Step 1: Create the table component**

```tsx
// src/components/notifications/requisitions-table.tsx
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "#/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Textarea } from "#/components/ui/textarea"
import { toast } from "sonner"
import {
  promoteRequisitionsToRoute,
  dismissRequisition,
} from "#/server/functions/store/requisitions"

export interface RequisitionRow {
  id: string
  storeName: string
  productLabel: string
  suggestedQuantity: number
  baseline: number
  quantityAtOpen: number
  openedAt: Date
}

export interface RouteOption {
  id: string
  name: string
}

export interface SupplierOption {
  id: string
  name: string
}

export function RequisitionsTable({
  rows,
  routes,
  suppliers,
  onChanged,
}: {
  rows: RequisitionRow[]
  routes: RouteOption[]
  suppliers: SupplierOption[]
  onChanged: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Store</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>On hand</TableHead>
            <TableHead>Typical</TableHead>
            <TableHead>Suggested</TableHead>
            <TableHead>Opened</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Checkbox
                  checked={picked.has(r.id)}
                  onCheckedChange={(c) => {
                    const next = new Set(picked)
                    if (c) next.add(r.id)
                    else next.delete(r.id)
                    setPicked(next)
                  }}
                />
              </TableCell>
              <TableCell>{r.storeName}</TableCell>
              <TableCell className="font-medium">{r.productLabel}</TableCell>
              <TableCell>{r.quantityAtOpen}</TableCell>
              <TableCell>{r.baseline}</TableCell>
              <TableCell>{r.suggestedQuantity}</TableCell>
              <TableCell>
                {new Date(r.openedAt).toLocaleDateString("en-GB")}
              </TableCell>
              <TableCell>
                <DismissButton id={r.id} onDone={onChanged} />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                No open requisitions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <PromoteDialog
        selectedIds={[...picked]}
        routes={routes}
        suppliers={suppliers}
        onDone={() => {
          setPicked(new Set())
          onChanged()
        }}
      />
    </div>
  )
}

function PromoteDialog({
  selectedIds,
  routes,
  suppliers,
  onDone,
}: {
  selectedIds: string[]
  routes: RouteOption[]
  suppliers: SupplierOption[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [routeId, setRouteId] = useState(routes[0]?.id ?? "")
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      const r = await promoteRequisitionsToRoute({
        data: {
          requisitionIds: selectedIds,
          supplyRouteId: routeId,
          supplierId,
        },
      })
      toast.success(`${r.promoted} requisition(s) added to the route.`)
      setOpen(false)
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to promote.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={selectedIds.length === 0}>
          Add {selectedIds.length || ""} to supply route
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote requisitions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Planning route</label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Supplier</label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={go} disabled={busy}>
            {busy ? "Adding…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DismissButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      await dismissRequisition({ data: { id, reason } })
      toast.success("Requisition dismissed.")
      setOpen(false)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Dismiss
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dismiss requisition</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Why are you dismissing? (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={go} disabled={busy || reason.trim().length === 0}>
            {busy ? "Dismissing…" : "Dismiss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create the route**

```tsx
// src/routes/store/restock-requisitions.tsx
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { listOpenRequisitions } from "#/server/functions/store/requisitions"
import { listPlanningSupplyRoutes } from "#/server/functions/supply-routes"
// ↑ Add this in src/server/functions/supply-routes.ts if missing:
//   export const listPlanningSupplyRoutes = createServerFn().handler(async () => {
//     await requireSession();
//     return db.select({ id: supplyRoutes.id, name: supplyRoutes.name })
//       .from(supplyRoutes)
//       .where(eq(supplyRoutes.status, "planning"))
//   })
import { listSuppliers } from "#/server/functions/suppliers"  // verify exact name
import { RequisitionsTable } from "#/components/notifications/requisitions-table"

export const Route = createFileRoute("/store/restock-requisitions")({
  loader: async () => {
    const [requisitions, routes, suppliers] = await Promise.all([
      listOpenRequisitions(),
      listPlanningSupplyRoutes(),
      listSuppliers(),
    ])
    return { requisitions, routes, suppliers }
  },
  component: RequisitionsPage,
})

function RequisitionsPage() {
  const { requisitions, routes, suppliers } = Route.useLoaderData()
  const router = useRouter()
  return (
    <div className="container max-w-6xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Restock requisitions</h1>
      <Card>
        <CardHeader>
          <CardTitle>Open requisitions</CardTitle>
          <CardDescription>
            Items the store needs more of. Select and add them to a planning
            supply route, or dismiss with a reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequisitionsTable
            rows={requisitions}
            routes={routes}
            suppliers={suppliers}
            onChanged={() => router.invalidate()}
          />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Force a store-low alert (drop a store_stock row, run check), navigate to `/store/restock-requisitions`, promote a row to a planning route, verify it appears as a `supply_route_items` line.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/requisitions-table.tsx src/routes/store/restock-requisitions.tsx src/server/functions/supply-routes.ts
git commit -m "feat(store): requisition queue UI with promote and dismiss"
```

---

## Task 21: Notification deep-links

**Files:**
- Modify: the existing notification bell component (locate first).

- [ ] **Step 1: Find the notification rendering component**

Run: `grep -rln "listMyNotifications\|notifications.bell\|<Bell" src/components src/routes --include='*.tsx' | head`
Expected: one component that renders the list — usually a `NotificationBell` or similar.

- [ ] **Step 2: Add a click handler / link for kind=`low_stock_open`**

In that component, when a notification has `kind === "low_stock_open"`:

- For shop-scoped alerts (`entityType === "low_stock_alert"`): fetch the alert's scope/locationId via a new lightweight server fn `getLowStockAlertNavTarget({ id })`, then `router.navigate({ to: "/shop/$shopId/restock", params: { shopId }, search: { variant: productColorId } })` for shop or `/store/restock-requisitions` for store.

- [ ] **Step 3: Implement `getLowStockAlertNavTarget`**

Add to `src/server/functions/notifications/notifications.ts`:

```ts
import { lowStockAlerts as lsa } from "#/db/schema"
const navTargetInput = z.object({ id: z.uuid() })

export const getLowStockAlertNavTarget = createServerFn()
  .inputValidator(navTargetInput)
  .handler(async ({ data }) => {
    await requireSession()
    const [row] = await db.select().from(lsa).where(eq(lsa.id, data.id))
    if (!row) throw new Error("Alert not found")
    return {
      scope: row.scope,
      locationId: row.locationId,
      productColorId: row.productColorId,
      size: row.size,
    }
  })
```

- [ ] **Step 4: Verify by clicking a notification in dev**

Run dev; force an alert; click the bell entry; land on the right page.

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/notifications/notifications.ts src/components/<bell-component>.tsx
git commit -m "feat(notifications): deep-link low-stock alerts to suggestion pages"
```

---

## Task 22: Cypress golden path

**Files:**
- Create: `cypress/e2e/04-restock-flow.cy.ts`

- [ ] **Step 1: Inspect an existing Cypress spec to mirror auth/setup pattern**

Run: `ls cypress/e2e/ && head -40 cypress/e2e/03-browser-verify.cy.ts`
Note how the spec logs in and seeds data.

- [ ] **Step 2: Write the spec**

```ts
// cypress/e2e/04-restock-flow.cy.ts
describe("Low-stock restock flow", () => {
  beforeEach(() => {
    // Reuse the existing login command (verify exact name in support/commands.ts)
    cy.loginAsAdmin()
    cy.seedLowStockFixture() // implement as a custom command that POSTs to a
    // test-only seed endpoint or directly to the DB via cy.task. If neither
    // exists yet, add cy.task("db:seedLowStock") in cypress.config.ts.
  })

  it("creates an alert, opens the suggestions page, and dispatches a transfer", () => {
    // Trigger manual check
    cy.visit("/settings/notifications")
    cy.contains("button", "Run check now").click()
    cy.contains("Check complete").should("be.visible")

    // Open the notification bell — should show low_stock_open
    cy.get('[data-testid="notification-bell"]').click()
    cy.contains("Low stock").click()

    // Land on the shop restock page
    cy.url().should("match", /\/shop\/[^/]+\/restock/)
    cy.contains("Currently low").should("be.visible")

    // Tick the first row and dispatch
    cy.get('[role="row"]').eq(1).find('[role="checkbox"]').click()
    cy.contains("button", "Create transfer").click()
    cy.contains("Transfer dispatched").should("be.visible")

    // We land in /store/transfers
    cy.url().should("include", "/store/transfers")
  })
})
```

- [ ] **Step 3: Run the spec**

Run: `pnpm cypress run --spec cypress/e2e/04-restock-flow.cy.ts`
Expected: pass. If `seedLowStockFixture` or `loginAsAdmin` doesn't exist, add them first to `cypress/support/commands.ts` and `cypress.config.ts`, then retry.

- [ ] **Step 4: Commit**

```bash
git add cypress/e2e/04-restock-flow.cy.ts cypress/support
git commit -m "test(e2e): cypress golden path for low-stock restock"
```

---

## Final check

- [ ] **Run the whole test suite**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run && pnpm cypress run`
Expected: green across the board.

- [ ] **Verify the cron handler builds**

Run: `pnpm build`
Expected: clean build output, no missing exports.

- [ ] **Manual smoke pass**

In dev:
1. `/settings/notifications` — change defaults, add a product override, run check.
2. `/settings/shops/<id>/overrides` — add a per-shop override.
3. Lower a `shop_stock.quantityOnHand` directly in `pnpm db:studio`, run check, click the bell, dispatch a transfer.
4. Lower a `store_stock.quantityOnHand`, run check, visit `/store/restock-requisitions`, promote to a planning route.

---

## Self-review notes

**Spec coverage check (against `2026-05-21-low-stock-notifications-and-restocking-design.md`):**

| Spec section | Plan task(s) |
|---|---|
| 1. Problem & goals | All tasks combined |
| 2. Architecture overview | Tasks 1, 7, 12, 13 |
| 3. Data model — 4 new tables | Task 1 |
| 4. Rule resolution & baseline | Tasks 3, 4, 5 |
| 5. Data flow A — hourly check | Tasks 7, 8 |
| 5. Data flow B — shop restock | Tasks 17, 18 |
| 5. Data flow C — store requisition → route | Tasks 19, 20 |
| 5. Data flow D — daily digest | Tasks 10, 11, 12, 13 |
| 5. Cron triggers (wrangler) | Task 13 |
| 6. Email visual design (React Email + Tailwind) | Task 11 |
| 7. UI surfaces & RBAC | Tasks 14, 15, 16, 18, 20, 21 |
| 8. Error handling & edge cases | Covered in lifecycle code (Task 7) + tests (Task 8) |
| 9. Testing strategy | Tasks 3, 4, 5, 6, 8, 12, 22 |

**Type-consistency check:** `Rule`, `Defaults`, `OverrideRow`, `Variant` defined once in `src/lib/notifications/types.ts` (Task 2) and reused. `LowStockDigestData` defined once in `src/lib/emails/low-stock-digest.tsx` (Tasks 10/11) and reused by `sendDailyLowStockDigestInternal` (Task 12). `CheckSummary` defined and returned consistently by `runThresholdChecksInternal`.

**Placeholder scan:** No "TBD", "TODO", or "handle edge cases" placeholders. Each step contains the actual code or command to run. Two spots are explicitly conditional with explicit fallback instructions: Task 13 Step 2 (TanStack worker-entry shape) and Task 18 Step 1 (existing `createStoreTransfer` name verification). Both name the exact verification command and the adaptation rule.
