# Variant Flexibility — Plan 2a: Shop Stock, Transfers, Stock-takes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip `shop_stock` to the variant-flexibility shape (item-keyed, nullable variant, supply-line cost provenance), make the store→shop transfer flow accept and emit unresolved lots, propagate the change through stock-takes, and ship a shop-side Specify dialog so unresolved shop stock can be refined at the shop.

**Architecture:** Same Approach 1 as Plan 1 — `shop_stock` gains a NOT-NULL denormalized `item_id`, drops `minimum_sell_price_ugx` (now item-level), gains a nullable `supply_route_line_id` so the lot's purchase cost is traceable end-to-end (supply line → store_stock → shop_stock). `variant_id` becomes nullable. A new `store_transfer_allocations` table records the per-source-row FIFO breakdown of each dispatched line, decoupling `store_transfer_lines` from a single `store_stock_id`. Transfers preserve `supply_route_line_id` across the move so cost provenance follows the goods. `stock_take_lines` get the same `item_id NOT NULL` / `variant_id NULL` denorms.

**Tech Stack:** Drizzle ORM + Drizzle Kit (Postgres 15+), TanStack Start server functions, TanStack Router, React + shadcn/ui, Vitest, BigNumber.js, Zod.

**Spec:** `docs/superpowers/specs/2026-05-31-variant-flexibility-design.md`

**Prerequisite:** Plan 1 must be merged. This plan assumes `items.minimum_sell_price_ugx`, `items.low_stock_threshold`, `store_stock.item_id`, nullable `store_stock.variant_id`, the shared `SplitItemForm`, the shared `SpecifyStockDialog`, and the `specifyStock` server fn all exist.

**Out of scope (Plan 2b/2c):**
- POS / `recordSale` / sale-line allocations (Plan 2b)
- Returns (shop and store) (Plan 2b)
- `low_stock_alerts`, `restock_requisitions`, `notification_threshold_overrides` reshape and the low-stock job rewrite (Plan 2c)
- Sale/transfer/return audit metadata reshape (Plan 2c) — transfer audit *renderer* updates land here as needed; metadata-schema unification is 2c.

---

## Pre-flight

- [ ] **Step 0.1:** Confirm `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass on `main` before starting.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green (Plan 1 left main on 81 test files / 523 tests passing — confirm the baseline still holds).

- [ ] **Step 0.2:** Confirm Postgres ≥ 15 (Neon defaults to 17). The new `shop_stock` uniqueness key uses `UNIQUE NULLS NOT DISTINCT`.

```bash
psql "$DATABASE_URL" -c "SHOW server_version;"
```

Expected: `15.x` or higher.

- [ ] **Step 0.3:** Drop and re-push the dev DB. This plan adds a NOT NULL `shop_stock.item_id` without a default; an empty table is required.

```bash
pnpm db:push -- --force
pnpm db:seed
```

Expected: clean DB, seed succeeds.

---

## Phase 1 — Shop stock schema flip

`shop_stock` becomes the mirror of `store_stock`: keyed on item, variant nullable, lot cost preserved via `supply_route_line_id`, item-level minimum-sell-price replaces the per-row column.

### Task 1: Add `item_id`, `supply_route_line_id`, make `variant_id` nullable, drop `minimum_sell_price_ugx` on `shop_stock`

**Files:**
- Modify: `src/db/schema/shops.ts`
- Test: `src/__tests__/shop-stock-schema-flexibility.test.ts` (create)

- [ ] **Step 1.1: Write the failing test**

```ts
// src/__tests__/shop-stock-schema-flexibility.test.ts
import { describe, it, expect } from "vitest"
import { shopStock } from "#/db/schema/shops"

describe("shop_stock schema — variant-flexibility", () => {
  it("has item_id as NOT NULL uuid", () => {
    const col = shopStock.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it("variant_id is nullable", () => {
    const col = shopStock.variantId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("has supply_route_line_id (nullable) for cost provenance", () => {
    const col = shopStock.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("no longer carries minimumSellPriceUgx", () => {
    expect(
      (shopStock as unknown as Record<string, unknown>).minimumSellPriceUgx,
    ).toBeUndefined()
  })
})
```

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/shop-stock-schema-flexibility.test.ts
```

Expected: FAIL — `shopStock.itemId` undefined, `variantId` notNull, `minimumSellPriceUgx` still present.

- [ ] **Step 1.3: Edit `src/db/schema/shops.ts`**

Add imports at the top:

```ts
import { items } from "./items"
import { supplyRouteLines } from "./supply-routes"
```

Replace the `shopStock` table definition with:

```ts
export const shopStock = pgTable(
  "shop_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    // Carries the original purchase lot from supply through store → shop.
    // Two shop_stock rows for the same (shop, item, variant) but different
    // supply lines stay separate so per-lot cost is preserved.
    supplyRouteLineId: uuid("supply_route_line_id").references(
      () => supplyRouteLines.id,
      { onDelete: "restrict" },
    ),
    storeTransferItemId: uuid("store_transfer_item_id"),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_shst_shop").on(table.shopId),
    index("idx_shst_item").on(table.itemId),
    index("idx_shst_variant").on(table.variantId),
    index("idx_shst_line").on(table.supplyRouteLineId),
    index("idx_shst_transfer_item").on(table.storeTransferItemId),
    // Replaces uq_shst_variant. NULLS NOT DISTINCT means at most one
    // (shop, item, NULL variant, NULL line) row.
    unique("uq_shst_shop_item_variant_line")
      .on(table.shopId, table.itemId, table.variantId, table.supplyRouteLineId)
      .nullsNotDistinct(),
  ],
)
```

Update `shopStockRelations` to add `item` and `supplyRouteLine`:

```ts
export const shopStockRelations = relations(shopStock, ({ one }) => ({
  shop: one(shops, {
    fields: [shopStock.shopId],
    references: [shops.id],
  }),
  item: one(items, {
    fields: [shopStock.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [shopStock.variantId],
    references: [variants.id],
  }),
  supplyRouteLine: one(supplyRouteLines, {
    fields: [shopStock.supplyRouteLineId],
    references: [supplyRouteLines.id],
  }),
}))
```

- [ ] **Step 1.4: Run the test to verify it passes**

```bash
pnpm test src/__tests__/shop-stock-schema-flexibility.test.ts
```

Expected: PASS.

- [ ] **Step 1.5: Generate migration**

```bash
pnpm db:generate
```

Expected: a new file under `drizzle/` that drops `uq_shst_variant`, drops `minimum_sell_price_ugx`, adds `item_id NOT NULL`, adds `supply_route_line_id` nullable, makes `variant_id` nullable, adds the new indexes and `uq_shst_shop_item_variant_line NULLS NOT DISTINCT`. Hand-inspect the SQL — `ADD COLUMN item_id ... NOT NULL` without a default will fail on a non-empty table. Step 0.3 ensured the table is empty in dev; if it isn't, drop and re-push first.

- [ ] **Step 1.6: Apply migration**

```bash
pnpm db:push:all
```

Expected: both dev and test DBs migrated cleanly.

- [ ] **Step 1.7: Commit**

```bash
git add src/db/schema/shops.ts src/__tests__/shop-stock-schema-flexibility.test.ts drizzle/
git commit -m "feat(shop-stock): item_id denorm + nullable variant_id + supply line provenance"
```

### Task 2: Update existing shop_stock readers so they compile

Every reader that selected `shopStock.minimumSellPriceUgx` or assumed `variantId NOT NULL` now needs a touch-up. The deeper rewrites for POS/returns/alerts land in Plan 2b/2c; this task only does the minimum to keep the build green.

**Files (read all of these first to plan changes):**

```bash
grep -rln "shopStock\." src/server/functions/
```

Expected list (from current main):
- `src/server/functions/admin/opening-balance.ts` (writer — patched in Task 3)
- `src/server/functions/items/prices.ts` (selectMinimumSellPrice from shop_stock — replace with item read)
- `src/server/functions/items/variant-stock-counts.ts` (variant-keyed; OK as-is because resolved rows still have `variant_id`)
- `src/server/functions/prereqs/shop.ts`
- `src/server/functions/shop/restock-suggestions.ts`
- `src/server/functions/shop/sales.ts` (deep rewrite is Plan 2b — patch the type-level breakage here only)
- `src/server/functions/shop/stock-take.ts` (rewrite at Task 16)
- `src/server/functions/shop/returns.ts` (rewrite is Plan 2b — minimal patch only)
- `src/server/functions/store/returns.ts` (writes shopStock on store→shop return — minimal patch only)
- `src/server/functions/store/transfers.ts` (full rewrite is Tasks 6–9)

- [ ] **Step 2.1: Patch `items/prices.ts`**

```bash
grep -n "shopStock\|minimumSellPriceUgx" src/server/functions/items/prices.ts
```

If `prices.ts` selects `shopStock.minimumSellPriceUgx` anywhere, switch the read to `items.minimumSellPriceUgx` joined through `shopStock.itemId`. If it writes to `shopStock.minimumSellPriceUgx`, delete the write — `setItemMinimumSellPrice` (Plan 1) is the single source of truth.

After patching, run:

```bash
pnpm typecheck
```

Expected: no errors mentioning `prices.ts`.

- [ ] **Step 2.2: Patch `shop/sales.ts` minimally**

Find every reference to `shopStock.minimumSellPriceUgx`. Replace with `shopStock.item.minimumSellPriceUgx` (after adjusting the `with` clause to load `item: true`). Do NOT rewrite the recordSale flow — leave it variant-keyed for now; Plan 2b replaces it with item-level FIFO + allocations.

If `recordSale` upserts into `shopStock` (it doesn't currently — it only reads — but verify), keep the existing variant-keyed write path working by passing `itemId` through.

Run:

```bash
pnpm typecheck 2>&1 | grep "sales.ts"
```

Expected: no remaining errors.

- [ ] **Step 2.3: Patch `shop/returns.ts` and `store/returns.ts` minimally**

Same pattern: read item-level min sell price from `items`, not `shopStock`. Any upserts into `shopStock` need to pass `itemId` (derive from `shopStock.item` or from the originating sale/transfer line's item).

For `store/returns.ts` specifically, the `returnDispatch`/`returnReceive` flow likely upserts back into `storeStock` — if so, it already has Plan 1's shape, so no change. The shop_stock writes from `store/returns.ts` need `itemId` + `supplyRouteLineId` carried through.

Concrete patch shape for inserts:

```ts
await tx.insert(shopStock).values({
  shopId,
  itemId,                       // NEW — pull from the originating line's item
  variantId,                    // unchanged for variant-keyed returns
  supplyRouteLineId,            // NEW — pull from the originating shopStock row
  storeTransferItemId,
  quantityOnHand,
  costPerUnitUgx,
})
```

Update the `onConflictDoUpdate` target if used: replace `[shopStock.shopId, shopStock.variantId]` with `[shopStock.shopId, shopStock.itemId, shopStock.variantId, shopStock.supplyRouteLineId]`. Note: `onConflictDoUpdate` with NULL keys is unreliable — prefer an explicit find-then-insert-or-update like Plan 1's receiving handler does (see `src/server/functions/store/receiving.ts` for the pattern landed in Plan 1).

Run:

```bash
pnpm typecheck 2>&1 | grep "returns.ts"
```

Expected: no remaining errors.

- [ ] **Step 2.4: Patch `prereqs/shop.ts` and `shop/restock-suggestions.ts`**

These mostly aggregate stock — replace selections of `shopStock.variantId NOT NULL` with item-level aggregation. Likely change: `SUM(quantity_on_hand) GROUP BY item_id` instead of `GROUP BY variant_id`. The restock suggestions query may currently key on variant; switch to item.

(Deep low-stock-job rewrite is Plan 2c — this step only keeps the existing call sites compiling.)

```bash
pnpm typecheck 2>&1 | grep -E "prereqs|restock-suggestions"
```

Expected: no remaining errors.

- [ ] **Step 2.5: Run full typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green. If any test breaks because it asserted on `shopStock.minimumSellPriceUgx`, update the test to read from `items.minimumSellPriceUgx`. Do NOT modify behaviour beyond the minimum to compile — those rewrites belong to Plan 2b/2c.

- [ ] **Step 2.6: Commit**

```bash
git add -A
git commit -m "refactor(shop-stock): minimal call-site updates after schema flip"
```

### Task 3: `seedOpeningBalance` writes item-keyed shop_stock

The admin opening-balance importer at `src/server/functions/admin/opening-balance.ts:244` writes `shopStock`. Update it to set `item_id` and to support an unresolved row when only an item is provided in the Excel sheet.

**Files:**
- Modify: `src/server/functions/admin/opening-balance.ts`
- Test: `src/__tests__/opening-balance-shop-unresolved.test.ts` (create)

- [ ] **Step 3.1: Read the current shop_stock insert in opening-balance**

```bash
sed -n '200,290p' src/server/functions/admin/opening-balance.ts
```

Locate the loop that writes `shopStock`. Note how it resolves the variant from the row data today.

- [ ] **Step 3.2: Write the failing test**

```ts
// src/__tests__/opening-balance-shop-unresolved.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { shopStock } from "#/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import { seedOpeningBalance } from "#/server/functions/admin/opening-balance"
import {
  resetTestDb,
  seedItem,
  seedShop,
  loginAsAdmin,
} from "./test-helpers"

describe("opening-balance — shop unresolved rows", () => {
  beforeEach(async () => {
    await resetTestDb()
    await loginAsAdmin()
  })

  it("creates a variant-less shop_stock row when only item info is provided", async () => {
    const itemId = await seedItem({
      articleNumber: "OP-1",
      name: "Polo Aggregate",
    })
    const shopId = await seedShop({ name: "Main Shop" })

    await seedOpeningBalance({
      data: {
        shopId,
        rows: [
          {
            articleNumber: "OP-1",
            colorName: null,
            size: null,
            quantity: 12,
            costPerUnitUgx: "1500.00",
          },
        ],
      },
    })

    const rows = await db.query.shopStock.findMany({
      where: and(
        eq(shopStock.shopId, shopId),
        eq(shopStock.itemId, itemId),
        isNull(shopStock.variantId),
      ),
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityOnHand).toBe(12)
  })
})
```

If `seedShop` is missing from `test-helpers.ts`, add it now (parallels `seedStore`).

- [ ] **Step 3.3: Run the test to verify it fails**

```bash
pnpm test src/__tests__/opening-balance-shop-unresolved.test.ts
```

Expected: FAIL — current handler throws / writes the wrong shape.

- [ ] **Step 3.4: Patch the handler**

In `src/server/functions/admin/opening-balance.ts`, in the loop that inserts into `shopStock`:

1. Resolve `itemId` first — look up by `articleNumber` if the row carries one. Throw a clear error if no item matches.
2. Resolve `variantId` only when `colorName` AND `size` are both non-empty. Otherwise leave `null`.
3. Pass `itemId` (required) and `variantId` (nullable) to the insert.
4. Set `supplyRouteLineId: null` and `storeTransferItemId: null` — opening balance does not have a supply line.
5. Drop `minimumSellPriceUgx` from the insert payload (column no longer exists).

Concrete shape:

```ts
const item = await tx.query.items.findFirst({
  where: eq(items.articleNumber, row.articleNumber),
})
if (!item) throw new Error(`No item with article ${row.articleNumber}`)

let variantId: string | null = null
if (row.colorName && row.size) {
  // Resolve-or-create the color and variant, same way Plan 1's
  // specifyStock does. Reuse the helper if you've factored it out.
  // ...
}

await tx.insert(shopStock).values({
  shopId: data.shopId,
  itemId: item.id,
  variantId,
  supplyRouteLineId: null,
  storeTransferItemId: null,
  quantityOnHand: row.quantity,
  costPerUnitUgx: row.costPerUnitUgx,
})
```

The corresponding audit entry should also include `itemId` and a nullable `variantId` instead of (or alongside) the old shape. Use the same `articleNumbers: [item.articleNumber]` pattern from Plan 1.

- [ ] **Step 3.5: Run the test to verify it passes**

```bash
pnpm test src/__tests__/opening-balance-shop-unresolved.test.ts
```

Expected: PASS.

- [ ] **Step 3.6: Add a sibling test for the resolved row**

```ts
it("creates a variant-keyed row when color and size are provided", async () => {
  const itemId = await seedItem({ articleNumber: "OP-2", name: "Polo Resolved" })
  // ... seed color + size on the item
  const shopId = await seedShop()
  await seedOpeningBalance({
    data: {
      shopId,
      rows: [{
        articleNumber: "OP-2",
        colorName: "Burgundy",
        size: "M",
        quantity: 8,
        costPerUnitUgx: "1500.00",
      }],
    },
  })
  const rows = await db.query.shopStock.findMany({
    where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
  })
  expect(rows).toHaveLength(1)
  expect(rows[0].variantId).not.toBeNull()
})
```

Run:

```bash
pnpm test src/__tests__/opening-balance-shop-unresolved.test.ts
```

Expected: both PASS.

- [ ] **Step 3.7: Run the existing import-excel test suite**

```bash
pnpm test src/__tests__/excel-import.test.ts src/__tests__/import-prepare.test.ts
```

Expected: green. The opening-balance flow is upstream of the Excel importer, so changes here can ripple. Fix any test that asserted on the old `(shopId, variantId)` shape by replacing with `(shopId, itemId, variantId)`.

- [ ] **Step 3.8: Typecheck, lint, full test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 3.9: Commit**

```bash
git add -A
git commit -m "feat(opening-balance): write item-keyed shop_stock with optional variant"
```

---

## Phase 2 — Transfer-line schema + allocations table

Two structural changes: `store_transfer_lines` gains `item_id NOT NULL` + nullable `variant_id` denorms (so an item-level dispatch can be recorded without forcing a specific source stock row), drops `minimum_sell_price_ugx`. A new `store_transfer_allocations` table records the per-source-row FIFO breakdown when a dispatched quantity is satisfied across multiple stock lots.

### Task 4: Add `item_id` + `variant_id` to `store_transfer_lines`, drop `minimum_sell_price_ugx`

The existing `store_stock_id` FK becomes nullable to support item-level dispatch (the actual decrement target is recorded in allocations instead). Existing test data is dev-only and gets wiped in Step 0.3.

**Files:**
- Modify: `src/db/schema/transfers.ts`
- Test: `src/__tests__/transfer-lines-schema-flexibility.test.ts` (create)

- [ ] **Step 4.1: Write the failing test**

```ts
// src/__tests__/transfer-lines-schema-flexibility.test.ts
import { describe, it, expect } from "vitest"
import { storeTransferLines } from "#/db/schema/transfers"

describe("store_transfer_lines schema — variant-flexibility", () => {
  it("has item_id NOT NULL", () => {
    const col = storeTransferLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it("variant_id is nullable", () => {
    const col = storeTransferLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("store_stock_id is now nullable", () => {
    const col = storeTransferLines.storeStockId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("no longer carries minimumSellPriceUgx", () => {
    expect(
      (storeTransferLines as unknown as Record<string, unknown>)
        .minimumSellPriceUgx,
    ).toBeUndefined()
  })
})
```

- [ ] **Step 4.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/transfer-lines-schema-flexibility.test.ts
```

Expected: FAIL.

- [ ] **Step 4.3: Edit `src/db/schema/transfers.ts`**

Add the `items` and `variants` imports at the top (if not already present):

```ts
import { items } from "./items"
import { variants } from "./variants"
```

Update `storeTransferLines`:

```ts
export const storeTransferLines = pgTable(
  "store_transfer_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeTransferId: uuid("store_transfer_id")
      .notNull()
      .references(() => storeTransfers.id, { onDelete: "cascade" }),
    // Now nullable — item-level dispatch records the source rows in
    // store_transfer_allocations instead of a single stock_id.
    storeStockId: uuid("store_stock_id").references(() => storeStock.id, {
      onDelete: "restrict",
    }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id").references(() => variants.id, {
      onDelete: "restrict",
    }),
    quantityDispatched: integer("quantity_dispatched").notNull(),
    quantityReceived: integer("quantity_received"),
    discrepancyNotes: text("discrepancy_notes"),
    unitPriceUgx: numeric("unit_price_ugx", { precision: 15, scale: 2 }).notNull(),
    totalPriceUgx: numeric("total_price_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_stl_transfer").on(table.storeTransferId),
    index("idx_stl_item").on(table.itemId),
    index("idx_stl_variant").on(table.variantId),
  ],
)
```

Drop `minimumSellPriceUgx` entirely.

Update `storeTransferLineRelations`:

```ts
export const storeTransferLineRelations = relations(storeTransferLines, ({ one, many }) => ({
  storeTransfer: one(storeTransfers, {
    fields: [storeTransferLines.storeTransferId],
    references: [storeTransfers.id],
  }),
  storeStockItem: one(storeStock, {
    fields: [storeTransferLines.storeStockId],
    references: [storeStock.id],
  }),
  item: one(items, {
    fields: [storeTransferLines.itemId],
    references: [items.id],
  }),
  variant: one(variants, {
    fields: [storeTransferLines.variantId],
    references: [variants.id],
  }),
  // Forward-declared — table added in Task 5.
  allocations: many(storeTransferAllocations),
}))
```

(If the `many(storeTransferAllocations)` forward reference causes a circular-import error at this point, comment that line and add it back at the end of Task 5.)

- [ ] **Step 4.4: Run the test to verify it passes**

```bash
pnpm test src/__tests__/transfer-lines-schema-flexibility.test.ts
```

Expected: PASS.

- [ ] **Step 4.5: Generate migration and apply**

```bash
pnpm db:generate && pnpm db:push:all
```

Expected: drops `minimum_sell_price_ugx`, adds `item_id NOT NULL`, adds nullable `variant_id`, makes `store_stock_id` nullable, adds the new indexes.

- [ ] **Step 4.6: Commit**

```bash
git add src/db/schema/transfers.ts src/__tests__/transfer-lines-schema-flexibility.test.ts drizzle/
git commit -m "feat(transfer-lines): item_id denorm + nullable variant_id + drop min sell price"
```

### Task 5: Create `store_transfer_allocations` table

One row per source `store_stock` decrement that satisfied a `store_transfer_line`. Lets us record FIFO breakdowns when a single dispatched line drains multiple lots.

**Files:**
- Modify: `src/db/schema/transfers.ts` (add new table)
- Modify: `src/db/schema/index.ts` (export the new table)
- Test: `src/__tests__/transfer-allocations-schema.test.ts` (create)

- [ ] **Step 5.1: Write the failing test**

```ts
// src/__tests__/transfer-allocations-schema.test.ts
import { describe, it, expect } from "vitest"
import { storeTransferAllocations } from "#/db/schema"

describe("store_transfer_allocations schema", () => {
  it("exists with the expected NOT NULL keys", () => {
    expect(storeTransferAllocations).toBeDefined()
    const stl = storeTransferAllocations.storeTransferLineId
    const ss = storeTransferAllocations.storeStockId
    expect((stl as { notNull?: boolean }).notNull).toBe(true)
    expect((ss as { notNull?: boolean }).notNull).toBe(true)
  })

  it("has supplyRouteLineId nullable for provenance carry", () => {
    const col = storeTransferAllocations.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
```

- [ ] **Step 5.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/transfer-allocations-schema.test.ts
```

Expected: FAIL — `storeTransferAllocations` not exported.

- [ ] **Step 5.3: Add the table in `src/db/schema/transfers.ts`**

Append below `storeTransferLines`:

```ts
export const storeTransferAllocations = pgTable(
  "store_transfer_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeTransferLineId: uuid("store_transfer_line_id")
      .notNull()
      .references(() => storeTransferLines.id, { onDelete: "cascade" }),
    storeStockId: uuid("store_stock_id")
      .notNull()
      .references(() => storeStock.id, { onDelete: "restrict" }),
    // Snapshot of the source stock row's supply line at allocation time.
    // Lets the receive side rebuild shop_stock rows with the correct
    // supply_route_line_id even if the source row is later deleted by
    // a zeroing transfer.
    supplyRouteLineId: uuid("supply_route_line_id").references(
      () => supplyRouteLines.id,
      { onDelete: "set null" },
    ),
    quantity: integer("quantity").notNull(),
    // Cost snapshot from source row at allocation time.
    costPerUnitUgx: numeric("cost_per_unit_ugx", { precision: 15, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sta_line").on(table.storeTransferLineId),
    index("idx_sta_stock").on(table.storeStockId),
    index("idx_sta_supply_line").on(table.supplyRouteLineId),
  ],
)

export const storeTransferAllocationRelations = relations(
  storeTransferAllocations,
  ({ one }) => ({
    transferLine: one(storeTransferLines, {
      fields: [storeTransferAllocations.storeTransferLineId],
      references: [storeTransferLines.id],
    }),
    storeStockItem: one(storeStock, {
      fields: [storeTransferAllocations.storeStockId],
      references: [storeStock.id],
    }),
    supplyRouteLine: one(supplyRouteLines, {
      fields: [storeTransferAllocations.supplyRouteLineId],
      references: [supplyRouteLines.id],
    }),
  }),
)
```

Add the import for `supplyRouteLines` at the top of the file if not already present.

Re-enable the `allocations: many(storeTransferAllocations)` line on `storeTransferLineRelations` (commented out in Task 4 if needed).

- [ ] **Step 5.4: Export from the schema barrel**

In `src/db/schema/index.ts`, add to the transfers re-export block:

```ts
export {
  // ... existing exports
  storeTransferAllocations,
  storeTransferAllocationRelations,
} from "./transfers"
```

- [ ] **Step 5.5: Run the test to verify it passes**

```bash
pnpm test src/__tests__/transfer-allocations-schema.test.ts
```

Expected: PASS.

- [ ] **Step 5.6: Generate migration and apply**

```bash
pnpm db:generate && pnpm db:push:all
```

Expected: `CREATE TABLE store_transfer_allocations` with the four indexes.

- [ ] **Step 5.7: Commit**

```bash
git add src/db/schema/transfers.ts src/db/schema/index.ts src/__tests__/transfer-allocations-schema.test.ts drizzle/
git commit -m "feat(transfers): add store_transfer_allocations table for FIFO breakdown"
```

---

## Phase 3 — FIFO helper

A single, well-tested helper that picks source `store_stock` rows for a (storeId, itemId, optional variantId, requested qty) and returns the per-row allocation plan. Used by `createTransfer` in Task 8; same helper will be reused by `recordSale` in Plan 2b.

### Task 6: `pickStoreStockFifo` helper

**Files:**
- Create: `src/server/functions/store/fifo.ts`
- Test: `src/__tests__/store-fifo.test.ts` (create)

- [ ] **Step 6.1: Write the failing tests — six scenarios**

```ts
// src/__tests__/store-fifo.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { pickStoreStockFifo } from "#/server/functions/store/fifo"
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedStore,
  seedSupplyRouteLine,
  seedStoreStockLot,
} from "./test-helpers"

describe("pickStoreStockFifo — unresolved-first FIFO", () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  it("drains a single resolved lot when variantId is provided", async () => {
    const itemId = await seedItem({ articleNumber: "T1", name: "Tee" })
    const colorId = await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    const lineId = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const { stockId, variantId } = await seedStoreStockLot({
      storeId, itemId, colorId, size: "M", supplyRouteLineId: lineId,
      quantity: 10, costPerUnitUgx: "100.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId, itemId, variantId, quantity: 4,
    })

    expect(plan.allocations).toEqual([
      { storeStockId: stockId, quantity: 4, costPerUnitUgx: "100.00", supplyRouteLineId: lineId },
    ])
    expect(plan.shortfall).toBe(0)
  })

  it("when variantId omitted: drains unresolved lot before any variant lot", async () => {
    const itemId = await seedItem({ articleNumber: "T2", name: "Tee" })
    const colorId = await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    const oldVariantLine = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const newUnresolvedLine = await seedSupplyRouteLine({ itemId, colorId: null, size: null })

    const { stockId: variantStock } = await seedStoreStockLot({
      storeId, itemId, colorId, size: "M",
      supplyRouteLineId: oldVariantLine, quantity: 10, costPerUnitUgx: "100.00",
    })
    const { stockId: unresolvedStock } = await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: newUnresolvedLine, quantity: 5, costPerUnitUgx: "120.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId, itemId, quantity: 8,
    })

    // Unresolved lot first (5), then oldest variant lot (3)
    expect(plan.allocations).toHaveLength(2)
    expect(plan.allocations[0]).toMatchObject({ storeStockId: unresolvedStock, quantity: 5 })
    expect(plan.allocations[1]).toMatchObject({ storeStockId: variantStock, quantity: 3 })
    expect(plan.shortfall).toBe(0)
  })

  it("within each group, oldest supply line wins", async () => {
    const itemId = await seedItem({ articleNumber: "T3", name: "Tee" })
    const colorId = await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    // older line then newer line — both unresolved
    const olderLine = await seedSupplyRouteLine({ itemId, colorId: null, size: null, createdAt: "2026-01-01" })
    const newerLine = await seedSupplyRouteLine({ itemId, colorId: null, size: null, createdAt: "2026-02-01" })
    const { stockId: older } = await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: olderLine, quantity: 5, costPerUnitUgx: "100.00",
    })
    const { stockId: newer } = await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: newerLine, quantity: 5, costPerUnitUgx: "110.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId, itemId, quantity: 7,
    })

    expect(plan.allocations[0]).toMatchObject({ storeStockId: older, quantity: 5 })
    expect(plan.allocations[1]).toMatchObject({ storeStockId: newer, quantity: 2 })
    expect(plan.shortfall).toBe(0)
  })

  it("reports shortfall when total on-hand < requested", async () => {
    const itemId = await seedItem({ articleNumber: "T4", name: "Tee" })
    const storeId = await seedStore()
    const lineId = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: lineId, quantity: 3, costPerUnitUgx: "100.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId, itemId, quantity: 10,
    })
    expect(plan.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(3)
    expect(plan.shortfall).toBe(7)
  })

  it("variantId filter skips unresolved lots", async () => {
    const itemId = await seedItem({ articleNumber: "T5", name: "Tee" })
    const colorId = await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    const variantLine = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const unresolvedLine = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    const { stockId: vStock, variantId } = await seedStoreStockLot({
      storeId, itemId, colorId, size: "M",
      supplyRouteLineId: variantLine, quantity: 5, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: unresolvedLine, quantity: 10, costPerUnitUgx: "120.00",
    })

    const plan = await pickStoreStockFifo(db, {
      storeId, itemId, variantId, quantity: 3,
    })

    expect(plan.allocations).toEqual([
      { storeStockId: vStock, quantity: 3, costPerUnitUgx: "100.00", supplyRouteLineId: variantLine },
    ])
  })

  it("returns no allocations when quantity = 0", async () => {
    const itemId = await seedItem({ articleNumber: "T6", name: "Tee" })
    const storeId = await seedStore()

    const plan = await pickStoreStockFifo(db, {
      storeId, itemId, quantity: 0,
    })

    expect(plan.allocations).toEqual([])
    expect(plan.shortfall).toBe(0)
  })
})
```

`seedSupplyRouteLine`, `seedStoreStockLot`, `seedColor` need helper updates. `seedSupplyRouteLine` accepts optional `colorId`, `size`, and `createdAt`; `seedStoreStockLot` writes a `store_stock` row tied to a supply line and returns the new variant id (if a color+size was supplied) so tests can use it without re-querying.

- [ ] **Step 6.2: Run the tests to verify they fail**

```bash
pnpm test src/__tests__/store-fifo.test.ts
```

Expected: FAIL — `pickStoreStockFifo` not exported.

- [ ] **Step 6.3: Implement the helper**

Create `src/server/functions/store/fifo.ts`:

```ts
import { and, asc, eq, isNull } from "drizzle-orm"
import { storeStock } from "#/db/schema"
import { supplyRouteLines } from "#/db/schema"
import type { DbOrTx } from "#/db"

export interface FifoAllocation {
  storeStockId: string
  quantity: number
  costPerUnitUgx: string
  supplyRouteLineId: string | null
}

export interface FifoPlan {
  allocations: FifoAllocation[]
  shortfall: number
}

export interface FifoInput {
  storeId: string
  itemId: string
  /** If provided, only that variant's stock is considered.
   *  If omitted, unresolved lots are drained first, then variants. */
  variantId?: string
  quantity: number
}

export async function pickStoreStockFifo(
  tx: DbOrTx,
  input: FifoInput,
): Promise<FifoPlan> {
  if (input.quantity <= 0) return { allocations: [], shortfall: 0 }

  // Fetch all candidate stock rows in one query, joined with supply line
  // createdAt for ordering.
  const conditions = [
    eq(storeStock.storeId, input.storeId),
    eq(storeStock.itemId, input.itemId),
  ]
  if (input.variantId) {
    conditions.push(eq(storeStock.variantId, input.variantId))
  }

  const rows = await tx
    .select({
      id: storeStock.id,
      variantId: storeStock.variantId,
      supplyRouteLineId: storeStock.supplyRouteLineId,
      quantityOnHand: storeStock.quantityOnHand,
      costPerUnitUgx: storeStock.costPerUnitUgx,
      supplyLineCreatedAt: supplyRouteLines.createdAt,
    })
    .from(storeStock)
    .leftJoin(
      supplyRouteLines,
      eq(supplyRouteLines.id, storeStock.supplyRouteLineId),
    )
    .where(and(...conditions))

  // Sort: (unresolved-first if variantId not specified), then oldest supply
  // line first (NULL supply line treated as oldest of the variantless group
  // so opening-balance rows drain first when present).
  const sorted = rows.toSorted((a, b) => {
    if (!input.variantId) {
      const aUnresolved = a.variantId === null
      const bUnresolved = b.variantId === null
      if (aUnresolved !== bUnresolved) return aUnresolved ? -1 : 1
    }
    const at = a.supplyLineCreatedAt?.getTime() ?? 0
    const bt = b.supplyLineCreatedAt?.getTime() ?? 0
    return at - bt
  })

  const allocations: FifoAllocation[] = []
  let remaining = input.quantity
  for (const r of sorted) {
    if (remaining <= 0) break
    if (r.quantityOnHand <= 0) continue
    const take = Math.min(r.quantityOnHand, remaining)
    allocations.push({
      storeStockId: r.id,
      quantity: take,
      costPerUnitUgx: r.costPerUnitUgx,
      supplyRouteLineId: r.supplyRouteLineId,
    })
    remaining -= take
  }

  return { allocations, shortfall: remaining }
}
```

If `DbOrTx` doesn't exist in `#/db`, add a type alias there:

```ts
// src/db/index.ts
import type { PgTransaction } from "drizzle-orm/pg-core"
export type DbOrTx = typeof db | PgTransaction<any, any, any>
```

- [ ] **Step 6.4: Run the tests to verify they pass**

```bash
pnpm test src/__tests__/store-fifo.test.ts
```

Expected: all 6 PASS.

- [ ] **Step 6.5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: green.

- [ ] **Step 6.6: Commit**

```bash
git add src/server/functions/store/fifo.ts src/__tests__/store-fifo.test.ts src/__tests__/test-helpers.ts src/db/index.ts
git commit -m "feat(store): add pickStoreStockFifo helper (unresolved-first FIFO)"
```

---

## Phase 4 — `createTransfer` accepts item-level dispatch with FIFO

### Task 7: Refactor input schema and add item-level dispatch entry

Today's input is `{ storeStockId, quantityDispatched, minimumSellPriceUgx? }`. The new input is `{ itemId, variantId?, quantityDispatched }` plus a backwards-compat path is NOT needed — the app is in development.

**Files:**
- Modify: `src/server/functions/store/transfers.ts`
- Test: `src/__tests__/create-transfer-item-level.test.ts` (create)

- [ ] **Step 7.1: Write the failing test**

```ts
// src/__tests__/create-transfer-item-level.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import {
  storeTransferLines,
  storeTransferAllocations,
  storeStock,
} from "#/db/schema"
import { eq, and } from "drizzle-orm"
import { createTransfer } from "#/server/functions/store/transfers"
import {
  resetTestDb,
  seedItem,
  seedColor,
  seedStore,
  seedShop,
  seedSupplyRouteLine,
  seedStoreStockLot,
  loginAsAdmin,
} from "./test-helpers"

describe("createTransfer — item-level FIFO", () => {
  beforeEach(async () => {
    await resetTestDb()
    await loginAsAdmin()
  })

  it("dispatches an unresolved item across multiple source lots oldest-first", async () => {
    const itemId = await seedItem({ articleNumber: "TX-1", name: "Polo" })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const olderLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-01-01",
    })
    const newerLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-02-01",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: olderLine, quantity: 4, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: newerLine, quantity: 6, costPerUnitUgx: "120.00",
    })

    const transfer = await createTransfer({
      data: {
        shopId,
        items: [{ itemId, quantityDispatched: 7 }],
      },
    })

    // One transfer line was created
    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].itemId).toBe(itemId)
    expect(lines[0].variantId).toBeNull()
    expect(lines[0].quantityDispatched).toBe(7)

    // Two allocations: 4 from older, 3 from newer
    const allocs = await db.query.storeTransferAllocations.findMany({
      where: eq(storeTransferAllocations.storeTransferLineId, lines[0].id),
    })
    expect(allocs).toHaveLength(2)
    const qs = allocs.map((a) => a.quantity).sort()
    expect(qs).toEqual([3, 4])

    // Source store_stock decremented
    const lots = await db.query.storeStock.findMany({
      where: and(eq(storeStock.storeId, storeId), eq(storeStock.itemId, itemId)),
    })
    const total = lots.reduce((s, l) => s + l.quantityOnHand, 0)
    expect(total).toBe(3) // 10 - 7
  })

  it("throws with a clear message when total on-hand < requested", async () => {
    const itemId = await seedItem({ articleNumber: "TX-2", name: "Polo" })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const lineId = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: lineId, quantity: 2, costPerUnitUgx: "100.00",
    })

    await expect(
      createTransfer({
        data: { shopId, items: [{ itemId, quantityDispatched: 5 }] },
      }),
    ).rejects.toThrow(/insufficient/i)
  })

  it("variantId-scoped dispatch only draws from that variant's lots", async () => {
    const itemId = await seedItem({ articleNumber: "TX-3", name: "Polo" })
    const colorId = await seedColor({ itemId, colorName: "Red", colorHex: "#f00" })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const vLine = await seedSupplyRouteLine({ itemId, colorId, size: "M" })
    const uLine = await seedSupplyRouteLine({ itemId, colorId: null, size: null })
    const { variantId } = await seedStoreStockLot({
      storeId, itemId, colorId, size: "M",
      supplyRouteLineId: vLine, quantity: 5, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: uLine, quantity: 10, costPerUnitUgx: "120.00",
    })

    const transfer = await createTransfer({
      data: {
        shopId,
        items: [{ itemId, variantId, quantityDispatched: 3 }],
      },
    })

    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    expect(lines[0].variantId).toBe(variantId)
    const allocs = await db.query.storeTransferAllocations.findMany({
      where: eq(storeTransferAllocations.storeTransferLineId, lines[0].id),
    })
    expect(allocs).toHaveLength(1)
    expect(allocs[0].quantity).toBe(3)
  })
})
```

- [ ] **Step 7.2: Run the tests to verify they fail**

```bash
pnpm test src/__tests__/create-transfer-item-level.test.ts
```

Expected: FAIL — input shape rejects `{itemId, quantityDispatched}`.

- [ ] **Step 7.3: Replace the input schema**

In `src/server/functions/store/transfers.ts`, replace `transferItemInput` and `createTransferInput`:

```ts
const transferItemInput = z.object({
  itemId: z.uuid(),
  variantId: z.uuid().optional(),
  quantityDispatched: z.number().int().positive(),
})

const createTransferInput = z.object({
  shopId: z.uuid(),
  notes: z.string().optional(),
  items: z.array(transferItemInput).min(1),
})
```

(Drop `minimumSellPriceUgx` from the line input. The unit price for the transfer line comes from the item's `minimumSellPriceUgx` floor — same as today's behaviour, just sourced from `items` instead of an override.)

- [ ] **Step 7.4: Rewrite the handler body**

Inside `db.transaction`, replace the per-item body with:

```ts
import { pickStoreStockFifo } from "./fifo"
import { storeTransferAllocations } from "#/db/schema"

// ... existing setup ...

for (const item of data.items) {
  const itemRow = await tx.query.items.findFirst({
    where: eq(items.id, item.itemId),
  })
  if (!itemRow) throw new Error(`Item not found: ${item.itemId}`)

  const plan = await pickStoreStockFifo(tx, {
    storeId: store.id,
    itemId: item.itemId,
    variantId: item.variantId,
    quantity: item.quantityDispatched,
  })

  if (plan.shortfall > 0) {
    const onHand = item.quantityDispatched - plan.shortfall
    throw new Error(
      `Insufficient stock for ${itemRow.articleNumber} ${itemRow.name}: ` +
      `have ${onHand}, need ${item.quantityDispatched}`,
    )
  }

  const unitPrice = new BigNumber(itemRow.minimumSellPriceUgx)
  const totalPrice = unitPrice.times(item.quantityDispatched)
  // Cost: weighted average across the allocations (lot costs may differ).
  const totalCost = plan.allocations.reduce(
    (sum, a) => sum.plus(new BigNumber(a.costPerUnitUgx).times(a.quantity)),
    new BigNumber(0),
  )

  const [line] = await tx
    .insert(storeTransferLines)
    .values({
      storeTransferId: transfer.id,
      storeStockId: null, // item-level dispatch
      itemId: item.itemId,
      variantId: item.variantId ?? null,
      quantityDispatched: item.quantityDispatched,
      unitPriceUgx: unitPrice.toFixed(2),
      totalPriceUgx: totalPrice.toFixed(2),
    })
    .returning()

  // Record per-source allocations and decrement each source row
  for (const alloc of plan.allocations) {
    await tx.insert(storeTransferAllocations).values({
      storeTransferLineId: line.id,
      storeStockId: alloc.storeStockId,
      supplyRouteLineId: alloc.supplyRouteLineId,
      quantity: alloc.quantity,
      costPerUnitUgx: alloc.costPerUnitUgx,
    })
    await tx
      .update(storeStock)
      .set({
        quantityOnHand: sql`${storeStock.quantityOnHand} - ${alloc.quantity}`,
      })
      .where(eq(storeStock.id, alloc.storeStockId))
  }

  totalTransferValue = totalTransferValue.plus(totalPrice)
  totalCostValue = totalCostValue.plus(totalCost)
}
```

Drop the old unresolved-stock blocker (lines 114-118 of the current file) — it's now redundant because FIFO handles unresolved lots first.

Drop every reference to `item.minimumSellPriceUgx` from the input — single source is `items.minimum_sell_price_ugx`.

- [ ] **Step 7.5: Update the audit description renderer if needed**

The current `transfer.create` description renderer uses `{actorName, shopName, itemCount}` — no per-line variant data. That stays compatible. The metadata block, however, currently has `{itemCount, totalTransferValueUgx, totalCostValueUgx}`. Leave it as-is for Plan 2a; Plan 2c reshapes line-level audit metadata.

- [ ] **Step 7.6: Run the tests to verify they pass**

```bash
pnpm test src/__tests__/create-transfer-item-level.test.ts
```

Expected: all 3 PASS. Debug iteratively if not.

- [ ] **Step 7.7: Run existing transfer tests**

```bash
pnpm test src/__tests__/transfer-create.test.ts src/__tests__/transfer-receive.test.ts src/__tests__/transfer-ledger.test.ts
```

(Adjust globs to match what actually exists — `pnpm test src/__tests__/transfer*` is fine.) Existing tests will use the old `{storeStockId, ...}` input shape and will need rewriting to use the new `{itemId, variantId?, quantityDispatched}` input. Update them rather than reverting the schema.

Expected after updates: all PASS.

- [ ] **Step 7.8: Typecheck + lint + full test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green. Fix any narrowing fallout from the new nullable `variant_id` on transfer lines.

- [ ] **Step 7.9: Commit**

```bash
git add -A
git commit -m "feat(transfers): item-level createTransfer with FIFO unresolved-first dispatch"
```

---

## Phase 5 — `confirmTransferReceipt` upserts shop_stock with cost provenance

The dispatched line decomposes back into N shop_stock rows on receipt, one per allocation, keyed on `(shopId, itemId, variantId, supplyRouteLineId)`. Distribution loss accounting unchanged.

### Task 8: Rewrite `confirmTransferReceipt`

**Files:**
- Modify: `src/server/functions/store/transfers.ts`
- Test: `src/__tests__/confirm-transfer-receipt.test.ts` (create or extend)

- [ ] **Step 8.1: Write the failing test**

```ts
// src/__tests__/confirm-transfer-receipt.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { db } from "#/db"
import { shopStock } from "#/db/schema"
import { and, eq, isNull } from "drizzle-orm"
import {
  createTransfer,
  confirmTransferReceipt,
} from "#/server/functions/store/transfers"
import {
  resetTestDb,
  seedItem,
  seedStore,
  seedShop,
  seedSupplyRouteLine,
  seedStoreStockLot,
  loginAsAdmin,
} from "./test-helpers"

describe("confirmTransferReceipt — variant-flexibility", () => {
  beforeEach(async () => {
    await resetTestDb()
    await loginAsAdmin()
  })

  it("creates one shop_stock row per allocation, keyed on (shop, item, variant=NULL, supply line)", async () => {
    const itemId = await seedItem({ articleNumber: "RX-1", name: "Polo" })
    const storeId = await seedStore()
    const shopId = await seedShop()
    const olderLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-01-01",
    })
    const newerLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-02-01",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: olderLine, quantity: 4, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: newerLine, quantity: 6, costPerUnitUgx: "120.00",
    })

    const transfer = await createTransfer({
      data: { shopId, items: [{ itemId, quantityDispatched: 7 }] },
    })

    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    await confirmTransferReceipt({
      data: {
        transferId: transfer.id,
        items: [{ transferItemId: lines[0].id, quantityReceived: 7 }],
      },
    })

    const rows = await db.query.shopStock.findMany({
      where: and(
        eq(shopStock.shopId, shopId),
        eq(shopStock.itemId, itemId),
        isNull(shopStock.variantId),
      ),
    })
    // One row per supply line, costs preserved
    expect(rows).toHaveLength(2)
    const byLine = Object.fromEntries(rows.map((r) => [r.supplyRouteLineId, r]))
    expect(byLine[olderLine].quantityOnHand).toBe(4)
    expect(byLine[olderLine].costPerUnitUgx).toBe("100.00")
    expect(byLine[newerLine].quantityOnHand).toBe(3)
    expect(byLine[newerLine].costPerUnitUgx).toBe("120.00")
  })

  it("partial receipt records distribution loss based on the dispatched mix", async () => {
    const itemId = await seedItem({ articleNumber: "RX-2", name: "Polo" })
    const storeId = await seedStore()
    const shopId = await seedShop()
    // item-level minimum sell price drives the unit transfer price = 200 UGX
    await db
      .update(items)
      .set({ minimumSellPriceUgx: "200.00" })
      .where(eq(items.id, itemId))
    const olderLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-01-01",
    })
    const newerLine = await seedSupplyRouteLine({
      itemId, colorId: null, size: null, createdAt: "2026-02-01",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: olderLine, quantity: 4, costPerUnitUgx: "100.00",
    })
    await seedStoreStockLot({
      storeId, itemId, variantId: null,
      supplyRouteLineId: newerLine, quantity: 6, costPerUnitUgx: "120.00",
    })

    const transfer = await createTransfer({
      data: { shopId, items: [{ itemId, quantityDispatched: 7 }] },
    })
    const lines = await db.query.storeTransferLines.findMany({
      where: eq(storeTransferLines.storeTransferId, transfer.id),
    })
    await confirmTransferReceipt({
      data: {
        transferId: transfer.id,
        items: [{ transferItemId: lines[0].id, quantityReceived: 5 }],
      },
    })

    // Shop stock totals 5 (down from dispatched 7)
    const shopRows = await db.query.shopStock.findMany({
      where: and(eq(shopStock.shopId, shopId), eq(shopStock.itemId, itemId)),
    })
    expect(shopRows.reduce((s, r) => s + r.quantityOnHand, 0)).toBe(5)

    // A distribution_loss journal entry exists for 2 × 200 = 400 UGX
    const ledger = await db.query.ledgerEntries.findMany({
      where: and(
        eq(ledgerEntries.referenceType, "distribution_loss"),
        eq(ledgerEntries.referenceId, lines[0].id),
      ),
    })
    expect(ledger.length).toBeGreaterThan(0)
    const lossDebit = ledger.find((e) => e.category === "Inventory Loss")
    expect(lossDebit?.amount).toBe("400.00")
  })
})
```

- [ ] **Step 8.2: Run the tests to verify they fail**

```bash
pnpm test src/__tests__/confirm-transfer-receipt.test.ts
```

Expected: FAIL — current handler still upserts on `(shopId, variantId)` and reads `minimumSellPriceUgx` from the transfer line.

- [ ] **Step 8.3: Rewrite the handler body**

In `confirmTransferReceipt`, change the `with` clause on the transfer query to load `item` and `allocations`:

```ts
const transfer = await tx.query.storeTransfers.findFirst({
  where: eq(storeTransfers.id, data.transferId),
  with: {
    items: {
      with: {
        item: true,
        variant: { with: { color: { with: { item: true } } } },
        allocations: true,
      },
    },
  },
})
```

Replace the per-line receipt loop:

```ts
for (const receiptItem of data.items) {
  const tl = transfer.items.find((i) => i.id === receiptItem.transferItemId)
  if (!tl) throw new Error(`Transfer item not found: ${receiptItem.transferItemId}`)
  if (tl.quantityReceived !== null) {
    throw new Error("This transfer item has already been received. Use a return flow to adjust.")
  }

  validateQuantityReceived(receiptItem.quantityReceived)
  validateDiscrepancyNotes({
    quantityExpected: tl.quantityDispatched,
    quantityReceived: receiptItem.quantityReceived,
    discrepancyNotes: receiptItem.discrepancyNotes,
  })

  await tx
    .update(storeTransferLines)
    .set({
      quantityReceived: receiptItem.quantityReceived,
      discrepancyNotes: receiptItem.discrepancyNotes,
    })
    .where(eq(storeTransferLines.id, tl.id))

  // Compute the receive split across allocations. We mirror the dispatched
  // proportions: if line dispatched 7 (4 from line A, 3 from line B) but
  // only 5 arrived, distribute 5 in the same proportions, rounding the
  // last bucket to absorb the remainder.
  const received = receiptItem.quantityReceived
  let remaining = received
  const lastIdx = tl.allocations.length - 1
  const buckets = tl.allocations.map((a, i) => {
    if (i === lastIdx) {
      return { alloc: a, take: remaining }
    }
    const share = Math.floor((received * a.quantity) / tl.quantityDispatched)
    remaining -= share
    return { alloc: a, take: share }
  })

  // Upsert shop_stock per (shop, item, variant, supply_route_line)
  for (const { alloc, take } of buckets) {
    if (take <= 0) continue
    const existing = await tx.query.shopStock.findFirst({
      where: and(
        eq(shopStock.shopId, transfer.shopId),
        eq(shopStock.itemId, tl.itemId),
        tl.variantId
          ? eq(shopStock.variantId, tl.variantId)
          : isNull(shopStock.variantId),
        alloc.supplyRouteLineId
          ? eq(shopStock.supplyRouteLineId, alloc.supplyRouteLineId)
          : isNull(shopStock.supplyRouteLineId),
      ),
    })
    if (existing) {
      await tx
        .update(shopStock)
        .set({
          quantityOnHand: sql`${shopStock.quantityOnHand} + ${take}`,
        })
        .where(eq(shopStock.id, existing.id))
    } else {
      await tx.insert(shopStock).values({
        shopId: transfer.shopId,
        itemId: tl.itemId,
        variantId: tl.variantId,
        supplyRouteLineId: alloc.supplyRouteLineId,
        storeTransferItemId: tl.id,
        quantityOnHand: take,
        costPerUnitUgx: alloc.costPerUnitUgx,
      })
    }
  }

  // Distribution loss accounting unchanged — value at unitPriceUgx
  const loss = tl.quantityDispatched - received
  if (loss > 0) {
    const lossValue = new BigNumber(tl.unitPriceUgx).times(loss)
    const itemLabel = tl.variant
      ? formatItemLabel(tl.item.articleNumber, tl.variant.color.colorName, tl.variant.size)
      : `${tl.item.articleNumber} ${tl.item.name}`
    await postJournalEntry(tx, {
      entries: [
        { type: "debit", category: "Inventory Loss", amount: lossValue.toFixed(2) },
        { type: "credit", category: "Inventory - Shop", amount: lossValue.toFixed(2) },
      ],
      referenceType: "distribution_loss",
      referenceId: tl.id,
      locationType: "shop",
      locationId: transfer.shopId,
      recordedBy: userId,
      description: `Distribution loss: ${loss}× ${itemLabel}`,
    })
  }
}
```

Drop the old "no variant" hard-throw — it's no longer correct, items without variants are now valid.

Drop `tl.minimumSellPriceUgx ?? ti.unitPriceUgx` — the column is gone. The receive side no longer carries a per-line minimum sell price (shop sells against `items.minimum_sell_price_ugx`).

- [ ] **Step 8.4: Run the new test to verify it passes**

```bash
pnpm test src/__tests__/confirm-transfer-receipt.test.ts
```

Expected: both PASS.

- [ ] **Step 8.5: Run the existing transfer-receive test suite**

```bash
pnpm test -- transfer
```

Expected: green. Update any test that asserted on `shopStock.minimumSellPriceUgx` to read item-level instead.

- [ ] **Step 8.6: Typecheck + lint + full test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 8.7: Commit**

```bash
git add -A
git commit -m "feat(transfers): receipt upserts shop_stock per-allocation with supply-line provenance"
```

---

## Phase 6 — Transfers UI: item-level picker

### Task 9: Transfer create page picks items, not stock rows

**Files:**
- Modify: `src/routes/store/transfers/new.tsx` (or equivalent — confirm path with `grep -rn "createTransfer" src/routes`)
- Modify: `src/server/functions/store/transfers.ts` (`listTransfers` may need `with: { items: { item: true, variant: ... } }` updated)

- [ ] **Step 9.1: Find the create-transfer route**

```bash
grep -rln "createTransfer\|create-transfer" src/routes/
```

Open the matching file. The current picker likely shows store_stock rows grouped by variant. Update it to show items, with a child variant-chip picker (mirroring the Plan 1 stock list pattern).

- [ ] **Step 9.2: Update the loader**

The loader should fetch the store's stock grouped by item, including unresolved totals — there's already a `getStoreStock` server fn from Plan 1 that returns this shape (`Array<{item, totalQty, rows[]}>`). Reuse it.

- [ ] **Step 9.3: Update the form state**

Replace `Array<{storeStockId, quantityDispatched, minimumSellPriceUgx?}>` with `Array<{itemId, variantId?, quantityDispatched}>`. Each row in the picker is an item; tapping a variant chip narrows to that variant; otherwise the dispatch hits "any" (FIFO unresolved-first).

- [ ] **Step 9.4: UI: per-line representation**

For each line in the cart, render:

```tsx
<div className="flex items-center gap-2">
  <span>{item.articleNumber} {item.name}</span>
  {line.variantId ? (
    <Badge>{variantLabel}</Badge>
  ) : (
    <Badge variant="outline" className="italic">Any (FIFO)</Badge>
  )}
  <Input type="number" min={1} value={line.quantityDispatched} onChange={...} />
</div>
```

Show an availability hint per line: total on-hand at the source store for the (item, variant?) pair, so the user can't overshoot at the form level.

- [ ] **Step 9.5: Drop the "Minimum sell price" input**

The shop-side minimum is the item-level floor (Plan 1). Remove the per-line shop-min field from the dispatch UI.

- [ ] **Step 9.6: Manually verify in dev**

```bash
pnpm dev
```

1. Receive an unresolved lot (Plan 1 receiving flow).
2. Go to the new-transfer page. Confirm the item appears with "Any (FIFO)" option.
3. Dispatch 5 units. Confirm a transfer is created and the source store_stock decremented.
4. On the receiving-shop side, confirm the transfer appears in the receive queue.

- [ ] **Step 9.7: Commit**

```bash
git add -A
git commit -m "feat(transfers-ui): item-level dispatch picker with optional variant scoping"
```

### Task 10: Transfer receive page renders item/variant labels including (unresolved)

**Files:**
- Modify: `src/components/transfers/receive-transfer-form.tsx`
- Modify: `src/routes/store/receiving.tsx` (if this page also lists incoming transfers)

- [ ] **Step 10.1: Find the receive form**

```bash
grep -rln "confirmTransferReceipt" src/
```

Open the matching component(s).

- [ ] **Step 10.2: Render labels for all three states**

For each transfer line, show the article + name unconditionally, and append the color · size only when a variant is set. Match the terminology convention established by commit `ffc20ab` (no "(unresolved)" suffix — a missing variant just shows nothing extra):

```tsx
<span>{line.item.articleNumber} {line.item.name}</span>
{line.variant && (
  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
    <span
      className="size-3 rounded-full border"
      style={{ backgroundColor: line.variant.color.colorHex }}
      aria-hidden
    />
    {line.variant.color.colorName} · {line.variant.size}
  </span>
)}
```

The current code (`src/components/transfers/receive-transfer-form.tsx` as of commit `ffc20ab`) reads `line.storeStockItem.variant.color.item.articleNumber` and shows nothing extra when `variant` is absent — replicate that pattern but read from `line.item` and `line.variant` (the new direct relations from Task 8's loader update).

- [ ] **Step 10.3: Update `listTransfers` `with` clause if needed**

In `src/server/functions/store/transfers.ts`, ensure the `listTransfers` query loads:

```ts
with: {
  shop: true,
  items: {
    with: {
      item: true,
      variant: { with: { color: true } },
      allocations: true, // so the receiver can preview the cost mix
    },
  },
},
```

(Drop the old `storeStockItem` nesting — it's only useful when a single source row drove the line, which is no longer the universal case.)

- [ ] **Step 10.4: Manually verify in dev**

```bash
pnpm dev
```

1. Dispatch a transfer with an unresolved line + a variant line from the previous task's fixtures.
2. Switch user context to the shop (or use the receive page).
3. Confirm both lines render with correct labels.
4. Confirm 7 → assert shop_stock split into two rows (one per supply line).

- [ ] **Step 10.5: Run typecheck + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 10.6: Commit**

```bash
git add -A
git commit -m "feat(transfers-ui): receive page renders unresolved/variant labels"
```

---

## Phase 7 — Shop-side Specify

Mirror of Plan 1's `specifyStock`, but for `shopStock`. Unresolved shop stock can be refined into variants at any time — useful when a transfer arrives unresolved and the cashier wants to label it before selling.

### Task 11: `specifyShopStock` server fn

**Files:**
- Create: `src/server/functions/shop/specify.ts`
- Test: `src/__tests__/specify-shop-stock.test.ts` (create)

- [ ] **Step 11.1: Write the failing test**

Mirror the four `specifyStock` tests from Plan 1, swapping `storeStock` → `shopStock` and `storeId` → `shopId`. Cases to cover:
- Full specification: 1 unresolved row → N variant rows, source deleted.
- Partial specification: source row keeps the leftover qty, variant_id stays NULL.
- Resolve-or-create variant: variant row is created on the fly when it doesn't exist.
- Reject when sum(lines) > available qty.
- Reject when colorId belongs to a different item.

Use a `seedUnresolvedShopStock` helper — sibling to `seedUnresolvedStock` from Plan 1.

- [ ] **Step 11.2: Run the tests to verify they fail**

```bash
pnpm test src/__tests__/specify-shop-stock.test.ts
```

Expected: FAIL.

- [ ] **Step 11.3: Implement**

Create `src/server/functions/shop/specify.ts`. Copy Plan 1's `src/server/functions/store/specify.ts` verbatim and swap the table identifiers:

- `storeStock` → `shopStock`
- `storeId` → `shopId`
- Audit `entityType: "store_stock"` → `entityType: "shop_stock"`
- Audit action stays `"stock.specify"` (description renderer is shape-agnostic).

The supply_route_line_id is inherited from the source row, exactly as in the store version. Cost is also inherited.

- [ ] **Step 11.4: Run the tests to verify they pass**

```bash
pnpm test src/__tests__/specify-shop-stock.test.ts
```

Expected: all PASS.

- [ ] **Step 11.5: Commit**

```bash
git add src/server/functions/shop/specify.ts src/__tests__/specify-shop-stock.test.ts
git commit -m "feat(shop-stock): add specifyShopStock server fn (mirror of store specify)"
```

### Task 12: Reuse `SpecifyStockDialog` on shop stock list

**Files:**
- Modify: `src/components/stock/specify-stock-dialog.tsx` (add a `target` prop)
- Modify: shop stock list page — find via `grep -rln "shopStock\|/shop/stock" src/routes/`

- [ ] **Step 12.1: Add a `target` prop to `SpecifyStockDialog`**

The Plan 1 dialog hardcodes a call to `specifyStock`. Make it polymorphic:

```tsx
interface SpecifyStockDialogProps {
  // ... existing props
  target: "store" | "shop"
}

// In the submit handler:
if (props.target === "shop") {
  await specifyShopStock({ data: { ... } })
} else {
  await specifyStock({ data: { ... } })
}
```

Import both. The dialog otherwise is unchanged — same inputs, same partial-specification semantics.

- [ ] **Step 12.2: Add a Specify button to the shop stock list**

Find the shop stock list page (likely `src/routes/shop/stock.tsx` or similar). Mirror the store stock list pattern from Plan 1: group rows by item, render Specify only on rows where `variantId === null` and only for admins.

- [ ] **Step 12.3: Manually verify in dev**

```bash
pnpm dev
```

1. Receive an unresolved transfer at the shop (using Task 8's fixtures).
2. Go to the shop stock page.
3. Click Specify on the unresolved row.
4. Split 5 into 3×Burgundy/M + 2×Forest/L.
5. Confirm two new variant rows appear and the unresolved row is gone.

- [ ] **Step 12.4: Run typecheck + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 12.5: Commit**

```bash
git add -A
git commit -m "feat(shop-stock-ui): reuse SpecifyStockDialog with target='shop'"
```

---

## Phase 8 — Stock-takes carry the same denorms

`stock_take_lines` already references `store_stock_id` OR `shop_stock_id` (XOR). Now that both stock tables have `item_id NOT NULL` and nullable `variant_id`, line-level reads can join through. For fast querying and a stable shape across reconciliations, add the same denorms.

### Task 13: Add `item_id` NOT NULL + `variant_id` nullable on `stock_take_lines`

**Files:**
- Modify: `src/db/schema/stock-takes.ts`
- Test: `src/__tests__/stock-take-lines-schema.test.ts` (create)

- [ ] **Step 13.1: Write the failing test**

```ts
// src/__tests__/stock-take-lines-schema.test.ts
import { describe, it, expect } from "vitest"
import { stockTakeLines } from "#/db/schema/stock-takes"

describe("stock_take_lines schema — variant-flexibility denorms", () => {
  it("has item_id NOT NULL", () => {
    const col = stockTakeLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })
  it("variant_id nullable", () => {
    const col = stockTakeLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
```

- [ ] **Step 13.2: Run the test to verify it fails**

```bash
pnpm test src/__tests__/stock-take-lines-schema.test.ts
```

Expected: FAIL.

- [ ] **Step 13.3: Edit the schema**

Add `items` and `variants` imports. Add the two columns to `stockTakeLines`:

```ts
itemId: uuid("item_id")
  .notNull()
  .references(() => items.id, { onDelete: "restrict" }),
variantId: uuid("variant_id").references(() => variants.id, {
  onDelete: "restrict",
}),
```

Add `idx_stkl_item` and `idx_stkl_variant` indexes.

Update relations to add `item` and `variant`.

- [ ] **Step 13.4: Run the test to verify it passes**

```bash
pnpm test src/__tests__/stock-take-lines-schema.test.ts
```

Expected: PASS.

- [ ] **Step 13.5: Generate migration and apply**

```bash
pnpm db:generate && pnpm db:push:all
```

Expected: `ALTER TABLE stock_take_lines ADD COLUMN item_id ... NOT NULL, ADD COLUMN variant_id ...`. The table is empty in dev (Step 0.3), so NOT NULL without default is safe.

- [ ] **Step 13.6: Commit**

```bash
git add -A
git commit -m "feat(stock-take-lines): item_id + nullable variant_id denorms"
```

### Task 14: `stockTake` server fn writes the new fields

**Files:**
- Modify: `src/server/functions/shop/stock-take.ts` and (if it exists) the store-side equivalent.

- [ ] **Step 14.1: Read the current handler**

```bash
grep -rn "stockTakeLines" src/server/functions/ | head
```

Open each writer.

- [ ] **Step 14.2: Patch each writer**

Every `tx.insert(stockTakeLines)` call must now set `itemId` (required) and `variantId` (nullable). Derive both from the source stock row's denorms:

```ts
const src = storeOrShopStockRow
await tx.insert(stockTakeLines).values({
  stockTakeId,
  storeStockId: src.table === "store_stock" ? src.id : null,
  shopStockId: src.table === "shop_stock" ? src.id : null,
  itemId: src.itemId,
  variantId: src.variantId,
  itemName: src.itemName,
  systemQuantity: src.qty,
  physicalQuantity: input.physicalQty,
  discrepancy: input.physicalQty - src.qty,
  notes: input.notes,
})
```

(The `itemName` field is denormalized text. As of commit `ffc20ab`, the convention for unresolved rows is plain `${articleNumber} — ${itemName}` with NO "(unresolved)" suffix; variant rows continue to use `formatItemLabel(articleNumber, colorName, size)`. Match this exactly — the user already softened that terminology project-wide.)

- [ ] **Step 14.3: Write a test for an unresolved stock-take row**

```ts
// add to existing stock-take test file
it("records an unresolved row with itemId set and variantId null", async () => {
  // seed unresolved shop_stock for an item, run stockTake, expect a
  // stock_take_lines row with itemId set and variantId null
})
```

Run, watch fail, implement, watch pass.

- [ ] **Step 14.4: Typecheck + lint + full test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 14.5: Commit**

```bash
git add -A
git commit -m "feat(stock-take): write item_id + variantId on every line"
```

---

## Phase 9 — End-to-end smoke + final cleanup

### Task 15: Manual end-to-end run

- [ ] **Step 15.1: Drop and re-seed dev DB**

```bash
pnpm db:push -- --force && pnpm db:seed
```

- [ ] **Step 15.2: Walk the golden path in `pnpm dev`**

1. Create supply route with one aggregate line (qty 10).
2. Receive 10 as unresolved (Plan 1 path).
3. Confirm store stock list shows 10 unresolved.
4. Create transfer: pick the item, dispatch 6, no variant selected.
5. Receive at shop: confirm 6.
6. Shop stock list shows 6 unresolved.
7. Specify shop stock: 4 Burgundy/M, 2 Forest/L.
8. Stock-take the shop: one variant row per specification, plus zero unresolved.

Document any rough edges as TODOs and commit them.

- [ ] **Step 15.3: Walk the variant-scoped path**

1. Same supply route + 10 received.
2. Specify 6 into Burgundy/M (Plan 1's `SpecifyStockDialog`).
3. Transfer 3 Burgundy/M (variant-scoped dispatch).
4. Receive at shop, confirm 3.
5. Shop stock list: one variant row for Burgundy/M, qty 3, cost = source lot's cost.

- [ ] **Step 15.4: Commit any UX fixes**

If the walkthrough surfaces small UI nits, fix them now in dedicated commits.

### Task 16: Drop deprecated columns and run a final sweep

- [ ] **Step 16.1: Grep for stragglers**

```bash
grep -rn "minimumSellPriceUgx" src/server/functions/store/transfers.ts src/server/functions/shop/ \
  src/server/functions/admin/ src/server/functions/items/prices.ts
grep -rn "storeStockId" src/server/functions/store/transfers.ts
```

Expected for the first command: zero references on transfer/shop write paths (Plan 2b/2c will sweep the remaining reads on sales/returns).

For the second: should now only appear in the FIFO allocation logic and in legacy single-stock-row dispatches (which no longer exist).

- [ ] **Step 16.2: Run the full test suite one last time**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: green.

- [ ] **Step 16.3: Commit any final fixes**

```bash
git add -A
git commit -m "chore(plan2a): final cleanup pass"
```

---

## Self-review checklist (orchestrator only)

After execution completes, verify:

- [ ] `shop_stock.item_id` NOT NULL, `variant_id` nullable, `supply_route_line_id` nullable, `minimum_sell_price_ugx` gone.
- [ ] `uq_shst_shop_item_variant_line` exists with `NULLS NOT DISTINCT`.
- [ ] `store_transfer_lines.item_id` NOT NULL, `variant_id` nullable, `store_stock_id` nullable, `minimum_sell_price_ugx` gone.
- [ ] `store_transfer_allocations` table exists with FKs to transfer line, store_stock, supply_route_lines.
- [ ] `pickStoreStockFifo` exists with 6 passing tests covering ordering, shortfall, variant-scoped, zero-qty.
- [ ] `createTransfer` accepts `{itemId, variantId?, quantityDispatched}`, no `minimumSellPriceUgx`, FIFO-decrements source.
- [ ] `confirmTransferReceipt` upserts shop_stock per allocation with `supply_route_line_id` carried through.
- [ ] `specifyShopStock` server fn + UI integration on shop stock list.
- [ ] `stock_take_lines.item_id` NOT NULL, `variant_id` nullable; all writers patched.
- [ ] All 81+ test files pass; the 7 new ones added in this plan are among them.

---

## What's NOT in this plan (intentionally)

- POS / `recordSale` / sale-line allocations — Plan 2b.
- Returns (shop and store) — Plan 2b. The Task 2 minimal patches keep returns compiling but variant-keyed; they're not yet item-flexible end-to-end.
- `low_stock_alerts`, `restock_requisitions`, `notification_threshold_overrides` reshape and the low-stock job rewrite — Plan 2c.
- Sale/transfer/return audit metadata reshape — Plan 2c.
- Removing per-variant low-stock thresholds — Plan 2c.

After Plan 2a lands, the user can receive and transfer unresolved goods end-to-end, refine them at either location, and reconcile via stock-takes. POS and alerts remain on the pre-flexibility code path but stay functional thanks to the Task 2 minimal patches.
