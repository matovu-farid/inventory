# Variant Flexibility — Plan 2b: POS / Sales / Returns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip POS, customer returns, and store returns to the variant-flexibility shape. Sales and returns become item-level — `shop_sale_lines`, `shop_return_lines`, and `store_return_lines` gain `item_id NOT NULL` + nullable `variant_id`, and each line is backed by allocation rows that record the specific source `shop_stock` lots drained (mirroring `store_transfer_allocations` from Plan 2a). The four `throw-on-unsupported-path` guards left by Plan 2a are removed as their callers are rewritten. The `prices.ts` `minimumSellPriceUgx` shop-row shim and the `shop/index.tsx` unresolved-row projection both go away once `recordSale` accepts item-level input.

**Architecture:** Same Approach 1 as Plans 1 + 2a. Each customer-facing line (sale, customer-return, store-return) carries item identity directly, and the lot breakdown lives in a sibling `*_allocations` table keyed `(line_id, shop_stock_id NOT NULL, supply_route_line_id NULL, quantity, cost_per_unit_ugx)`. A new `pickShopStockFifo` helper mirrors `pickStoreStockFifo`: unresolved lots first, then variant lots, oldest supply line first within each group. Receipts/COGS/audit/refund flows read line + allocations.

**Tech Stack:** Drizzle ORM + Drizzle Kit (Postgres 15+), TanStack Start server functions, TanStack Router, React + shadcn/ui, Vitest, BigNumber.js, Zod.

**Spec:** `docs/superpowers/specs/2026-05-31-variant-flexibility-design.md`

**Prerequisite:** Plan 1 and Plan 2a must be merged. This plan assumes `items.minimum_sell_price_ugx`, `shop_stock.{item_id NOT NULL, variant_id NULL, supply_route_line_id NULL}`, `store_transfer_allocations`, `pickStoreStockFifo`, `specifyShopStock`, and `SpecifyStockDialog (target: shop)` all exist.

**Out of scope (Plan 2c):**
- `low_stock_alerts`, `restock_requisitions`, `notification_threshold_overrides` reshape and the low-stock notification job rewrite (Plan 2c).
- Sale/transfer/return audit *metadata schema* unification to `{itemId, variantId|null, colorName?, size?, qty}` (Plan 2c). This plan adjusts audit *description renderers* where the underlying row shape changes (so descriptions don't regress), but does not rewrite the `lines: [...]` metadata key shape — that is a single sweep in 2c so the audit log stays internally consistent.
- `articleNumbers` resolution rewrite for `sale.create` / `shopReturn.create` / `storeReturn.dispatch` / `storeReturn.receive` audit entries (Plan 2c). Existing resolvers already walk through `shopSaleLines`/`shopReturnLines`/`storeReturnLines` to `items` — they keep working with the denormalized `item_id` and need no Plan 2b change, but the audit metadata reshape in 2c is where they get re-examined.
- `startStockTake` hardcoded `itemCount: 0` description fix (Plan 2c).

---

## Pre-flight

- [ ] **Step 0.1:** Confirm `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass on `main` before starting.

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green (Plan 2a left `main` at 84 test files / 556 tests passing — confirm the baseline still holds).

- [ ] **Step 0.2:** Confirm Postgres ≥ 15 (Neon defaults to 17). The new allocation tables don't strictly require `UNIQUE NULLS NOT DISTINCT`, but Plan 2a's `shop_stock` unique key already does.

```bash
psql "$DATABASE_URL" -c "SHOW server_version;"
```

Expected: `15.x` or higher.

- [ ] **Step 0.3:** Drop and re-push the dev DB. This plan adds `item_id NOT NULL` columns to `shop_sale_lines`, `shop_return_lines`, and `store_return_lines` without a default; an empty data set is required.

```bash
pnpm db:push -- --force
pnpm db:seed
```

Expected: clean DB, seed succeeds.

---

## Phase 1 — Allocations tables + shop FIFO picker

The transfer flow's `store_transfer_lines` + `store_transfer_allocations` pattern proved out in Plan 2a: a line records *what was sold/returned* (item + optional variant + total qty + price) while allocations record *which specific lots provided it* (one row per source `shop_stock` row with a `supply_route_line_id` snapshot and cost). Build the symmetric tables and a `shop_stock` FIFO helper first, before touching any business logic.

### Task 1: `pickShopStockFifo` helper (mirror of `pickStoreStockFifo`)

**Files:**
- Create: `src/server/functions/shop/fifo.ts`
- Test: `src/__tests__/pick-shop-stock-fifo.test.ts` (create)

- [ ] **Step 1.1:** Write the failing tests. Mirror `src/__tests__/pick-store-stock-fifo.test.ts` shape — exercise: (a) variant-scoped pick drains only that variant; (b) variant-omitted pick drains unresolved lots first; (c) within a group, oldest `supplyRouteLines.createdAt` first, with NULL collated as epoch; (d) shortfall reported when total qty is less than requested; (e) `quantityOnHand === 0` rows skipped.
- [ ] **Step 1.2:** Run; verify it fails (file does not exist).
- [ ] **Step 1.3:** Implement `pickShopStockFifo(tx, {shopId, itemId, variantId?, quantity}) => {allocations, shortfall}`. Same shape as `pickStoreStockFifo` but reads from `shopStock` and returns `{shopStockId, quantity, costPerUnitUgx, supplyRouteLineId}`. Re-export `DbOrTx` from the store fifo helper (do not duplicate the type).
- [ ] **Step 1.4:** Re-run tests. All green.

```bash
pnpm test src/__tests__/pick-shop-stock-fifo.test.ts
```

- [ ] **Step 1.5:** Commit: `feat(shop): add pickShopStockFifo helper (unresolved-first FIFO)`.

### Task 2: `shop_sale_line_allocations` table

**Files:**
- Modify: `src/db/schema/sales.ts`
- Modify: `src/db/schema/index.ts` (export the new table + relations)
- Test: `src/__tests__/shop-sale-line-allocations-schema.test.ts` (create)

- [ ] **Step 2.1:** Write the failing test. Asserts the table exists with columns `(id uuid PK, shop_sale_line_id uuid NOT NULL → shop_sale_lines.id ON DELETE CASCADE, shop_stock_id uuid NOT NULL → shop_stock.id ON DELETE RESTRICT, supply_route_line_id uuid NULL → supply_route_lines.id ON DELETE SET NULL, quantity integer NOT NULL, cost_per_unit_ugx numeric(15,2) NOT NULL, created_at timestamptz default now())`. Also asserts indices on `shop_sale_line_id`, `shop_stock_id`, `supply_route_line_id`.
- [ ] **Step 2.2:** Run; verify it fails.
- [ ] **Step 2.3:** Define `shopSaleLineAllocations` in `src/db/schema/sales.ts` using the exact shape of `storeTransferAllocations` (`src/db/schema/transfers.ts:135-163`). Index prefix `idx_ssla_*` (disambiguates from `idx_ssl_*` used by `shop_sale_lines`). Add `allocations: many(shopSaleLineAllocations)` to `shopSaleLineRelations`, and an inverse `shopSaleLineAllocationRelations` with the three FKs. Export from `src/db/schema/index.ts`.
- [ ] **Step 2.4:** `pnpm db:push -- --force && pnpm db:seed` (Step 0.3 already ran clean; confirm migration applies and the inspected schema matches).
- [ ] **Step 2.5:** Re-run tests. All green.
- [ ] **Step 2.6:** Commit: `feat(sales): add shop_sale_line_allocations table`.

### Task 3: `shop_return_line_allocations` table

**Files:**
- Modify: `src/db/schema/returns.ts`
- Modify: `src/db/schema/index.ts`
- Test: `src/__tests__/shop-return-line-allocations-schema.test.ts` (create)

- [ ] **Step 3.1:** Failing test. Shape: `(id, shop_return_line_id → shop_return_lines ON DELETE CASCADE, shop_stock_id → shop_stock ON DELETE RESTRICT, supply_route_line_id NULL → supply_route_lines ON DELETE SET NULL, quantity, cost_per_unit_ugx)`. Indices `idx_shrla_*`.
- [ ] **Step 3.2:** Run; verify fails.
- [ ] **Step 3.3:** Define `shopReturnLineAllocations` in `src/db/schema/returns.ts` mirroring Task 2. Add to relations.
- [ ] **Step 3.4:** `pnpm db:push -- --force && pnpm db:seed`.
- [ ] **Step 3.5:** Re-run; green.
- [ ] **Step 3.6:** Commit: `feat(returns): add shop_return_line_allocations table`.

### Task 4: `store_return_line_allocations` table

**Files:**
- Modify: `src/db/schema/returns.ts`
- Modify: `src/db/schema/index.ts`
- Test: `src/__tests__/store-return-line-allocations-schema.test.ts` (create)

- [ ] **Step 4.1:** Failing test. Shape: `(id, store_return_line_id → store_return_lines ON DELETE CASCADE, shop_stock_id → shop_stock ON DELETE RESTRICT, supply_route_line_id NULL → supply_route_lines ON DELETE SET NULL, quantity, cost_per_unit_ugx)`. Indices `idx_storla_*`.
- [ ] **Step 4.2:** Run; verify fails.
- [ ] **Step 4.3:** Define `storeReturnLineAllocations`. Add to relations.
- [ ] **Step 4.4:** `pnpm db:push -- --force && pnpm db:seed`.
- [ ] **Step 4.5:** Re-run; green.
- [ ] **Step 4.6:** Commit: `feat(returns): add store_return_line_allocations table`.

---

## Phase 2 — Item-level sales

This phase flips POS so a sale records `(itemId, variantId?, quantity, unitPriceUgx)` per line and the actual lot breakdown lives in `shop_sale_line_allocations`. The `Plan 2a` guard at `src/server/functions/shop/sales.ts:183` and at `src/server/functions/shop/receipt.ts:63` are removed in this phase.

### Task 5: Flip `shop_sale_lines` schema — add `item_id`, nullable `variant_id`, nullable `shop_stock_id`

**Files:**
- Modify: `src/db/schema/sales.ts`
- Test: `src/__tests__/shop-sale-lines-schema-flexibility.test.ts` (create)

- [ ] **Step 5.1:** Failing test. Asserts: `shopSaleLines.itemId` is NOT NULL uuid → `items.id`; `shopSaleLines.variantId` is nullable uuid → `variants.id`; `shopSaleLines.shopStockId` is nullable (sales now reference one or many lots through allocations); `unitPriceUgx`, `quantity`, `totalPriceUgx`, `belowMinimumReason`, `minimumPriceUgx`, `isBelowMinimum` unchanged.
- [ ] **Step 5.2:** Run; verify fails.
- [ ] **Step 5.3:** Update `shopSaleLines` in `src/db/schema/sales.ts`:
  - Add `itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "restrict" })`.
  - Add `variantId: uuid("variant_id").references(() => variants.id, { onDelete: "restrict" })`.
  - Make `shopStockId` nullable (drop `.notNull()`). Keep the FK with `onDelete: "restrict"` so old per-row inserts still type-check during the rewrite, but the new `recordSale` writes `NULL` here and uses allocations exclusively.
  - Update `shopSaleLineRelations`: add `item: one(items, …)`, `variant: one(variants, …)`, `allocations: many(shopSaleLineAllocations)`. Keep `shopStockItem: one(shopStock, …)` for backwards compat (callers will be migrated in Task 7-8).
  - Add index `idx_ssl_item` on `itemId`.
- [ ] **Step 5.4:** `pnpm db:push -- --force && pnpm db:seed`.
- [ ] **Step 5.5:** Re-run; green.
- [ ] **Step 5.6:** Commit: `feat(sale-lines): item_id NOT NULL + nullable variant_id + nullable shop_stock_id`.

### Task 6: Rewrite `recordSale` — item-level input + FIFO allocations

**Files:**
- Modify: `src/server/functions/shop/sales.ts`
- Modify: `src/server/functions/shop/sale-validate.ts` (if signature needs adjusting)
- Test: `src/__tests__/record-sale-item-level.test.ts` (create)

- [ ] **Step 6.1:** Write the failing tests. Cover:
  - Unresolved-only stock: `recordSale({items: [{itemId, quantity: 3}]})` drains the unresolved lot, writes one `shop_sale_lines` row with `variantId: null`, and three `shop_sale_line_allocations` rows summing to 3.
  - Mixed stock (1 unresolved + 1 variant lot): unresolved drains first, then variant.
  - Variant-scoped input: `recordSale({items: [{itemId, variantId, quantity: 2}]})` ignores unresolved, drains only the matching variant lot.
  - Shortfall: `pickShopStockFifo` returns non-zero shortfall → throw `"Insufficient stock for {item.articleNumber} {item.name}: …"` with the *item-level* shortage (not per-row).
  - Below-minimum: per-line `unitPriceUgx < items.minimumSellPriceUgx` enforced, reason captured on the line.
  - Ledger: revenue + COGS posted exactly as today; `totalCost` derived from allocation rows (sum `quantity × costPerUnitUgx`).
  - Audit log: `sale.create` description renders item label without throwing on null variant.
- [ ] **Step 6.2:** Run; verify they fail (`recordSale` still requires `shopStockId`).
- [ ] **Step 6.3:** Rewrite `recordSale`:
  - Change `saleItemInput` zod schema from `{shopStockId, quantity, unitPriceUgx, belowMinimumReason?}` to `{itemId, variantId?, quantity, unitPriceUgx, belowMinimumReason?}`.
  - For each input item: load `items.findFirst({columns: {id, articleNumber, name, minimumSellPriceUgx}})`. Call `pickShopStockFifo(tx, {shopId, itemId, variantId, quantity})`. Throw if `shortfall > 0`.
  - Run `validateBelowMinimumSale` against `items.minimumSellPriceUgx` (already item-level).
  - Sum `totalCost` from `allocations.reduce((s, a) => s + qty × cost, 0)` — no longer reads `stock.costPerUnitUgx` for the line.
  - Insert one `shopSaleLines` row per input item with `{shopSaleId, itemId, variantId: variantId ?? null, shopStockId: null, quantity, unitPriceUgx, minimumPriceUgx: item.minimumSellPriceUgx, isBelowMinimum, belowMinimumReason, totalPriceUgx}`.
  - For each FIFO allocation: insert `shopSaleLineAllocations` row `{shopSaleLineId, shopStockId, supplyRouteLineId, quantity, costPerUnitUgx}`.
  - Decrement source `shop_stock` per allocation (`UPDATE shop_stock SET quantityOnHand = quantityOnHand - allocation.quantity WHERE id = allocation.shopStockId`). Do not delete rows that hit 0 — keep them so analytics + audit trail remain stable. (Future stock-take or cleanup job can prune.)
  - **Delete** the guard at `sales.ts:181-185`. Replace `formatItemLabel(...articleNumber, colorName, size)` with item-aware variant of the same helper: if `variantId === null`, format as `${item.articleNumber} — ${item.name}` (no color/size suffix). Add `formatItemLabel`-style unresolved overload in `src/lib/items.ts` if needed.
  - Update ledger description: `Sale ${docNumber.formatted} (${data.items.length} items)` is unchanged; per-line description in `COGS` posting is unchanged.
  - Update audit `metadata.itemCount` + `totalCostUgx` unchanged; do **not** reshape the `articleNumbers` resolver yet (Plan 2c).
- [ ] **Step 6.4:** Re-run new + existing tests. All sales-related tests green.

```bash
pnpm test src/__tests__/record-sale-item-level.test.ts src/__tests__/sales
```

- [ ] **Step 6.5:** Commit: `feat(sales): item-level recordSale with FIFO allocations`.

### Task 7: Update receipt rendering — drop guard, read line.item directly

**Files:**
- Modify: `src/server/functions/shop/receipt.ts`
- Modify: `src/lib/pdf/receipt-html.ts` (if the item label shape changes)
- Test: `src/__tests__/sale-receipt-rendering.test.ts` (update if exists, else create)

- [ ] **Step 7.1:** Failing test: render a receipt for a sale with one unresolved line + one variant line. Asserts the unresolved line shows `${articleNumber} ${name}` (no `· color / size` suffix) and the variant line shows the full `${articleNumber} ${name} · ${colorName} / ${size}` label. Receipt total + per-line price unchanged.
- [ ] **Step 7.2:** Run; verify fails (guard at `receipt.ts:63` still throws).
- [ ] **Step 7.3:** Rewrite the `with:` shape in `getSaleReceiptHtml` to load `items: { with: { item: true, variant: { with: { color: { with: { item: true } } } } } }` — the new `item` relation gives the unresolved label without needing the variant. Replace the `if (!v) throw …` block with a branch:
  - If `i.variant`, label is `${i.variant.color.item.articleNumber} ${i.variant.color.item.name} · ${i.variant.color.colorName} / ${i.variant.size}`.
  - Otherwise, label is `${i.item.articleNumber} ${i.item.name}`.
- [ ] **Step 7.4:** Re-run; green.
- [ ] **Step 7.5:** Commit: `feat(receipt): item-level sale receipt rendering (drops Plan 2a guard)`.

### Task 8: Update `listShopSales` + sales-history UI to read line.item

**Files:**
- Modify: `src/server/functions/shop/sales.ts` (`listShopSales` `with:` shape)
- Modify: `src/routes/shop/sales.tsx` (or wherever sales history renders)
- Test: `src/__tests__/list-shop-sales-item-level.test.ts` (create)

- [ ] **Step 8.1:** Failing test: `listShopSales({shopId})` returns rows where each `items[]` entry has `item: { articleNumber, name, … }` and `variant: { … } | null`. Old `shopStockItem.variant.color.item.*` chain still resolves where present, but the new direct `item` is the source of truth.
- [ ] **Step 8.2:** Run; verify fails.
- [ ] **Step 8.3:** Update `listShopSales` `with:` to load `items: { with: { item: true, variant: { with: { color: { with: { item: true } } } } } }`. Keep `shopStockItem` for backwards-compat (sales-history UI will be updated in Step 8.5 to read the new shape).
- [ ] **Step 8.4:** Re-run; green.
- [ ] **Step 8.5:** Update `src/routes/shop/sales.tsx` to read `line.item` (always present) for the row label and `line.variant` (optional) for the variant chip. Render unresolved lines with an italic `Unresolved` chip following Plan 2a's terminology softening ([[project_variant_flexibility]] notes ffc20ab removed the explicit "(unresolved)" suffix — match that with a subtle visual indicator instead, e.g. the existing `Unresolved` badge component if one exists, otherwise an italic dimmed dash).
- [ ] **Step 8.6:** Commit: `feat(sales): listShopSales + history UI read line.item directly`.

### Task 9: Update POS UI — item-level `NewSaleForm`, drop unresolved filter

**Files:**
- Modify: `src/routes/shop/index.tsx`
- Modify: `src/components/sales/new-sale-form.tsx` (if it lives here)
- Modify: `src/components/sales/aggregate-stock-by-article.ts` (if it lives here, or wherever `aggregateStockByArticle` is)
- Test: `cypress/e2e/shop-sales-item-level.cy.ts` (create or extend) + `src/__tests__/new-sale-form-item-level.test.ts` (create)

- [ ] **Step 9.1:** Failing test (vitest) for `NewSaleForm`: given mixed unresolved + variant stock, the form renders one row per `(item, variantId?)` group, "Any (FIFO)" badge on the unresolved-aware row, and submitting calls `recordSale` with `{itemId, variantId?, quantity}` — not `{shopStockId}`.
- [ ] **Step 9.2:** Run; verify fails.
- [ ] **Step 9.3:** Refactor `NewSaleForm`'s `stock` prop type from `ShopStockItem[]` (variant-required projection) to `RawShopStockItem[]` (allows unresolved). Group rows by `(itemId, variantId)` for picker UI but submit one cart line per group with `{itemId, variantId, quantity}`. Read `minimumSellPriceUgx` from `row.item.minimumSellPriceUgx` consistently — drop the projection-time injection.
- [ ] **Step 9.4:** In `src/routes/shop/index.tsx`:
  - Delete `projectResolvedShopStock` and the `RawShopStockItem` → `ShopStockItem` mapping.
  - Delete the `setUnresolved(s.filter((r) => !r.variant))` split — the same rows flow into the sale form.
  - Drop the `pendingTransfers`-style amber banner for unresolved if any remains; the dedicated admin-only "Unresolved lots need variants" callout stays (it is still useful as a hint, but doesn't gate anything).
  - Pass `stock={stock.filter((s) => s.quantityOnHand > 0)}` to `NewSaleForm` directly (no resolved-only filter).
- [ ] **Step 9.5:** Re-run unit tests. All green.
- [ ] **Step 9.6:** Add/extend Cypress smoke: log in as admin, navigate to `/shop`, dispatch a transfer with an unresolved item (via Plan 2a's flow), confirm receipt, open New Sale, see the item with "Any (FIFO)" indicator, complete the sale, assert balance decremented. (If the existing `cypress/e2e/shop-stock.cy.ts` already covers a comparable golden path, extend it rather than duplicate.)
- [ ] **Step 9.7:** Commit: `feat(pos): item-level NewSaleForm + drop unresolved filter`.

---

## Phase 3 — Customer returns (shop → customer)

Customer returns mirror sales: a return reverses the lot decrements recorded by allocations. If `originalSaleId` is given, the return defaults to reversing the exact lots the sale drained (cheapest correct path — preserves COGS reversal accuracy). If `originalSaleId` is `null` (open-counter return without a receipt), the user picks the item + variant; the system re-stocks the *current* FIFO-aged-newest lot of that variant so cost provenance stays plausible.

### Task 10: Flip `shop_return_lines` schema

**Files:**
- Modify: `src/db/schema/returns.ts`
- Test: `src/__tests__/shop-return-lines-schema-flexibility.test.ts` (create)

- [ ] **Step 10.1:** Failing test. Asserts `shop_return_lines` has: `itemId` NOT NULL → items, `variantId` NULL → variants, `shopStockId` made nullable (analogous to `shopSaleLines`), `quantity`, `unitRefundPriceUgx`, `unitCostUgx`, `totalRefundUgx` unchanged.
- [ ] **Step 10.2:** Run; verify fails.
- [ ] **Step 10.3:** Update schema, add `idx_shrl_item` index, extend `shopReturnLineRelations` with `item`, `variant`, `allocations: many(shopReturnLineAllocations)`. Keep `shopStockItem` relation for backwards compat.
- [ ] **Step 10.4:** `pnpm db:push -- --force && pnpm db:seed`.
- [ ] **Step 10.5:** Re-run; green.
- [ ] **Step 10.6:** Commit: `feat(shop-return-lines): item_id + nullable variant_id + nullable shop_stock_id`.

### Task 11: Rewrite `recordCustomerReturn` — item-level with sale-allocation reversal

**Files:**
- Modify: `src/server/functions/shop/returns.ts`
- Modify: `src/server/functions/shop/refund-validate.ts` (signature only if needed)
- Test: `src/__tests__/record-customer-return-item-level.test.ts` (create)

- [ ] **Step 11.1:** Failing tests. Cover:
  - With `originalSaleId`: return reverses the allocation breakdown of the matching sale lines. For each return-input item, find the sale line(s) for `(itemId, variantId)`; replay their allocation breakdown up to the returned quantity (drawing from `shop_sale_line_allocations` oldest-first). Each allocation reversal writes a `shop_return_line_allocations` row + increments `shop_stock.quantityOnHand` for the *original* source row.
  - Without `originalSaleId` (open-counter return): use `pickShopStockFifo`-but-newest-first (or `findFirst({where: itemId+variantId, orderBy: createdAt desc})`) to choose where to re-stock — the *newest* lot, on the theory that the goods most recently sold are most likely the ones being returned. Document the choice in a comment.
  - Cost calculation: `totalCost` from the allocations table (not `stock.costPerUnitUgx`), so COGS reversal matches the original sale.
  - Refund methods (cash / bank / credit_adjustment) and credit-balance reduction unchanged.
- [ ] **Step 11.2:** Run; verify fails.
- [ ] **Step 11.3:** Change `returnItemInput` from `{shopStockId, quantity, unitRefundPriceUgx}` to `{itemId, variantId?, quantity, unitRefundPriceUgx}`. Rewrite the body to:
  1. Resolve the item.
  2. Pick allocations to reverse (sale-allocation walk if `originalSaleId`, else newest-FIFO).
  3. Insert one `shopReturnLines` row per input item with `{shopReturnId, itemId, variantId, shopStockId: null, quantity, unitRefundPriceUgx, unitCostUgx: weighted avg of reversed allocations, totalRefundUgx}`.
  4. For each reversed allocation: insert `shopReturnLineAllocations` row + `UPDATE shop_stock SET quantityOnHand = quantityOnHand + allocation.quantity WHERE id = …`.
  5. Ledger postings unchanged in shape; cost amount derived from the per-allocation cost.
- [ ] **Step 11.4:** Re-run + existing customer-return tests. All green.
- [ ] **Step 11.5:** Commit: `feat(customer-returns): item-level recordCustomerReturn with allocation reversal`.

### Task 12: Update customer-return UI

**Files:**
- Modify: `src/components/returns/customer-return-form.tsx` (or wherever the form lives)
- Modify: `src/routes/shop/$shopId/...` (return entry surface, if separate)
- Test: extend existing customer-return cypress spec, or `src/__tests__/customer-return-form.test.tsx`

- [ ] **Step 12.1:** Failing test: form lets the user pick item (+ optional variant) instead of a specific shop_stock row. When `originalSaleId` is provided, item rows default to the sale's `(item, variant)` pairs with qty capped at the sold qty.
- [ ] **Step 12.2:** Run; verify fails.
- [ ] **Step 12.3:** Rework the picker UI: replace shop-stock-row select with item picker (`SelectItem` per `(itemId, variantId|null)` resolved from `listShopSales` if sale-linked, or `getShopStock` aggregated by item if not). Submit `{itemId, variantId?, quantity, unitRefundPriceUgx}`.
- [ ] **Step 12.4:** Re-run; green.
- [ ] **Step 12.5:** Commit: `feat(customer-returns-ui): item-level return picker`.

---

## Phase 4 — Store returns (shop → store)

Store returns are the inverse of transfers: shop dispatches stock back to a store, store confirms receipt. The Plan 2a guards at `src/server/functions/store/returns.ts:64` and `:224` block unresolved shop_stock. Both go away when the flow becomes item-level and writes per-lot allocations the store can rebuild `store_stock` from (mirroring `confirmTransferReceipt`).

### Task 13: Flip `store_return_lines` schema

**Files:**
- Modify: `src/db/schema/returns.ts`
- Test: `src/__tests__/store-return-lines-schema-flexibility.test.ts` (create)

- [ ] **Step 13.1:** Failing test. Same pattern as Task 5/10: `itemId` NOT NULL, `variantId` NULL, `shopStockId` made nullable. `quantityDispatched`, `quantityReceived`, `unitTransferPriceUgx`, `unitCostUgx` unchanged.
- [ ] **Step 13.2:** Run; verify fails.
- [ ] **Step 13.3:** Update schema + relations (`item`, `variant`, `allocations: many(storeReturnLineAllocations)`).
- [ ] **Step 13.4:** `pnpm db:push -- --force && pnpm db:seed`.
- [ ] **Step 13.5:** Re-run; green.
- [ ] **Step 13.6:** Commit: `feat(store-return-lines): item_id + nullable variant_id + nullable shop_stock_id`.

### Task 14: Rewrite `dispatchStoreReturn` — item-level dispatch with FIFO allocations

**Files:**
- Modify: `src/server/functions/store/returns.ts`
- Test: `src/__tests__/dispatch-store-return-item-level.test.ts` (create)

- [ ] **Step 14.1:** Failing tests. Cover: unresolved shop_stock dispatched as-is; mixed unresolved + variant lots drained unresolved-first; variant-scoped dispatch only drains that variant; shortfall throws; audit log written with item-level metadata.
- [ ] **Step 14.2:** Run; verify fails (guard at `:64` still throws).
- [ ] **Step 14.3:** Rewrite:
  - Input: `{shopId, storeId, originalTransferId?, reason, items: [{itemId, variantId?, quantityDispatched, unitTransferPriceUgx}], notes?}`.
  - For each input item: call `pickShopStockFifo(tx, {shopId, itemId, variantId, quantity: quantityDispatched})`. Throw on shortfall.
  - Insert one `storeReturnLines` row per item with `{storeReturnId, itemId, variantId, shopStockId: null, quantityDispatched, unitTransferPriceUgx, unitCostUgx: weighted avg of allocations}`.
  - For each allocation: insert `storeReturnLineAllocations` row + decrement `shopStock`.
  - **Delete** the guard at `:62-66`. Use item-aware label helper.
- [ ] **Step 14.4:** Re-run; green.
- [ ] **Step 14.5:** Commit: `feat(store-returns): item-level dispatch with FIFO allocations`.

### Task 15: Rewrite `receiveStoreReturn` — rebuild store_stock per allocation

**Files:**
- Modify: `src/server/functions/store/returns.ts`
- Modify: `src/server/functions/store/return-entries.ts` (if total-derivation helpers need item-level inputs)
- Test: `src/__tests__/receive-store-return-item-level.test.ts` (create)

- [ ] **Step 15.1:** Failing tests. Cover:
  - Full receipt (qtyReceived = qtyDispatched): every allocation upserts a `store_stock` row keyed `(storeId, itemId, variantId, supplyRouteLineId)` with `quantityOnHand += allocation.quantity` and inherits `supplyRouteLineId` + `costPerUnitUgx`. Reversal journal posts identical to today.
  - Partial receipt: received qty distributed proportionally across allocations (last bucket absorbs rounding — mirror `confirmTransferReceipt` from Plan 2a). Discrepancy notes stay.
  - Unresolved store_stock survives the round trip: shop_stock dispatched with `variantId: null` becomes store_stock with `variantId: null` + the original supply_route_line_id.
  - Audit log: `storeReturn.receive` description renders item label without throwing on null variant.
- [ ] **Step 15.2:** Run; verify fails (guard at `:222-226` still throws).
- [ ] **Step 15.3:** Rewrite:
  - Replace the `with: { items: { with: { shopStock: {…} } } }` query with one that loads `items: { with: { item: true, variant: true, allocations: { with: { supplyRouteLine: true, shopStockItem: true } } } }`.
  - For each `storeReturnLines` row + its `quantityReceived` from input: distribute received qty across the line's allocations proportionally. For each allocation bucket with received qty > 0:
    - Upsert into `store_stock` keyed `(storeId, itemId, variantId, supplyRouteLineId)` — `INSERT ... ON CONFLICT … DO UPDATE SET quantityOnHand = quantityOnHand + EXCLUDED.quantityOnHand`. Cost is the allocation's `costPerUnitUgx` (which itself was a snapshot of the original supply line cost — `cost_per_unit_ugx` for inserts uses this snapshot; for the conflict path, leave existing `cost_per_unit_ugx` alone since the existing row already represents the same supply lot at that cost).
  - **Delete** the guard at `:219-226`. Use item-aware label helper.
  - Reversal journal: `buildStoreReturnReceiveEntries` already operates on aggregate totals — pass the same `totalCost` / `totalTransferPrice` it expects, now derived from line + allocation sums.
- [ ] **Step 15.4:** Re-run; green.
- [ ] **Step 15.5:** Commit: `feat(store-returns): item-level receipt rebuilds store_stock with supply-line provenance (drops Plan 2a guards)`.

### Task 16: Update store-return UI (dispatch + receive)

**Files:**
- Modify: `src/components/returns/dispatch-store-return-form.tsx` (or wherever)
- Modify: `src/components/returns/receive-store-return-form.tsx` (or wherever)
- Modify: routes that mount these forms
- Test: extend the existing store-return cypress spec; `src/__tests__/dispatch-store-return-form.test.tsx` (create)

- [ ] **Step 16.1:** Failing test: dispatch form lets the user pick item (+ optional variant) instead of a shop_stock row. Receive form reads `line.item` / `line.variant` directly with no `shopStock.variant.color.item` chain.
- [ ] **Step 16.2:** Run; verify fails.
- [ ] **Step 16.3:** Rework dispatch picker to mirror the Plan 2a transfer-create picker: item-level rows with "Any (FIFO)" badge for unresolved-aware items. Receive page reads line.item / line.variant. Drop the chained-relation reads.
- [ ] **Step 16.4:** Re-run; green.
- [ ] **Step 16.5:** Commit: `feat(store-returns-ui): item-level dispatch picker + receive reads line.item`.

---

## Phase 5 — Cleanups

Two things become possible only after Phases 2-4 land:

1. `prices.ts` no longer needs the `minimumSellPriceUgx` synthesis shim on shop rows — the PriceEditor can read item-level directly.
2. The "POS / shop-index silently filter unresolved rows" comment in [[project_variant_flexibility]] is no longer true after Task 9; this phase confirms there's nothing left to drop.

### Task 17: Drop `prices.ts` shop-row synthesis shim + `setShopStockMinimumPrice`

**Files:**
- Modify: `src/server/functions/items/prices.ts`
- Modify: `src/components/prices/price-editor.tsx` (or wherever PriceEditor lives)
- Test: extend `src/__tests__/list-item-stock-prices.test.ts` (or create)

- [ ] **Step 17.1:** Failing test: `listItemStockPrices({itemId})` returns shop rows *without* a synthetic `minimumSellPriceUgx`. Callers must read `item.minimumSellPriceUgx` for the floor.
- [ ] **Step 17.2:** Run; verify fails.
- [ ] **Step 17.3:** Edits:
  - In `prices.ts`: rewrite the shop query to also key on `itemId` (mirror what was done for the store query — query directly by `shopStock.itemId` instead of the variant-walk that's there today). Drop the `shopWithFloor` synthesis. Remove the `setShopStockMinimumPrice` server fn entirely (it was a shim documented as Plan 2b's removal point).
  - In `PriceEditor`: stop reading `row.minimumSellPriceUgx` for shop rows; read `item.minimumSellPriceUgx` from the top-level `item` field. Stop calling `setShopStockMinimumPrice` — the only writer is `setItemMinimumSellPrice` (already item-level).
- [ ] **Step 17.4:** Re-run; green. Existing PriceEditor tests must continue to pass.
- [ ] **Step 17.5:** Commit: `refactor(prices): drop shop-row min-price synthesis shim`.

### Task 18: Sanity sweep — remove any remaining unresolved-row filters or guard comments

**Files:**
- Modify (as needed): `src/routes/shop/index.tsx`, `src/routes/shop/sales.tsx`, anywhere `"Plan 2b"` appears in a comment
- Test: none (cleanup)

- [ ] **Step 18.1:** `grep -rn "Plan 2b" src/` — every remaining marker should be reviewed. If the underlying flow has been rewritten and the marker is just a stale comment, delete the comment. If the marker still indicates real work, file it as a Plan 2c follow-up note in this plan's "Out of scope" section.
- [ ] **Step 18.2:** `grep -rn "filter((r) => !r.variant)" src/` — any remaining unresolved filter for sales/returns purposes should be gone (display-only filters in audit / KPI surfaces are fine).
- [ ] **Step 18.3:** Run `pnpm typecheck && pnpm lint && pnpm test`. All green.
- [ ] **Step 18.4:** Commit: `chore(plan-2b): remove stale guards + unresolved filters`.

---

## Phase 6 — End-to-end smoke + memory

### Task 19: End-to-end smoke test

**Files:**
- Create: `src/__tests__/plan-2b-e2e-smoke.test.ts`

- [ ] **Step 19.1:** Mirror `src/__tests__/plan-2a-e2e-smoke.test.ts`'s structure. Two flows:
  - **Unresolved chain:** receive aggregate supply line → transfer to shop (item-level dispatch) → confirm receipt (shop_stock now has unresolved row) → **sell from unresolved** (records sale + allocation against the unresolved lot) → **customer return** (re-stocks the same unresolved lot) → **store return** (dispatch to store, receive — store_stock now has the unresolved row back). Assert balances, allocations, and ledger entries at each step.
  - **Variant-scoped chain:** same shape but with fully-resolved variant lines throughout. Confirms the item-level rewrite doesn't regress the variant-required path.
- [ ] **Step 19.2:** Run; both flows green.
- [ ] **Step 19.3:** Commit: `test(plan-2b): end-to-end smoke covers sell/return/store-return on unresolved + variant chains`.

### Task 20: Update memory + close out

- [ ] **Step 20.1:** Run `pnpm typecheck && pnpm lint && pnpm test`. Expected: ~570-580 tests passing.
- [ ] **Step 20.2:** Update `~/.claude/projects/-Users-faridmatovu-projects-inventory/memory/project_variant_flexibility.md`:
  - Move the four Plan 2a-marked guards out of the "still pending" list (they no longer exist).
  - Add a "Plan 2b — shipped {date}" section mirroring the Plan 2a section's shape: schema flips, allocations tables, FIFO helper, recordSale shape, return flows, prices.ts shim removal, e2e smoke.
  - Update the description in the front-matter to reflect that 2b shipped.
- [ ] **Step 20.3:** Push the branch. Open the PR (or merge directly if working on `main` as Plan 2a did).

---

## Risks and mitigations

- **Surface area.** 20 tasks across schema, server fns, UI, accounting, and audit. Mitigation: phase boundaries are real — each phase ends with a green test suite; commit-per-task means any phase can be reverted independently.
- **COGS accuracy.** Sales and returns now derive cost from per-allocation snapshots rather than current `stock.costPerUnitUgx`. This is actually a correctness win — current code already drifts if a `shop_stock` row's cost changes after a sale (it can't, today, but the structure was fragile). Mitigation: the e2e smoke test asserts ledger entries on every step.
- **Open-counter customer return cost.** Without `originalSaleId` we can't know the original lot's cost. The plan uses "newest-FIFO" (most recently-received lot for the item+variant) as a reasonable proxy. Document the choice in code. If accuracy matters more than convenience, a future iteration can require `originalSaleId` for credit-method returns.
- **Audit metadata churn.** Plan 2b deliberately does not reshape the `articleNumbers` resolver or `lines: [...]` metadata key shape — that's Plan 2c. Reason: changing audit shape mid-flight forces every audit-reading test to flap twice. Audit *descriptions* are updated where the underlying row shape requires it (renderer would otherwise throw on null variant), but metadata stays stable until 2c.
- **`shopStockItem` relation kept temporarily.** Phase 2-4 retain the legacy `shopStockItem: one(shopStock, …)` relation on the line tables for backwards compat while UI callers are migrated. Task 18 confirms no Plan 2b code path still relies on it. If anything does, Plan 2c should sweep the relations and drop them.

---

## Open follow-ups deferred to Plan 2c

- `low_stock_alerts`, `restock_requisitions`, `notification_threshold_overrides` reshape to item-keyed; low-stock notification job rewrite.
- Sale/transfer/return audit `lines: [...]` metadata reshape to `{itemId, variantId|null, colorName?, size?, qty}`.
- `articleNumbers` resolver re-examination once metadata shape changes.
- `startStockTake` audit description hardcodes `itemCount: 0` (metadata is correct; description disagrees) — minor inconsistency.
- Drop legacy `shopStockItem` relation on sale/return line tables once nothing reads it.

## InfoTip terms to consider

- `pos.anyFifo` — describing the "Any (FIFO)" badge: *"Picks from any available lot of this item, draining unresolved lots first, then variant lots, oldest goods first."*
- `return.allocationReversal` — describing customer-return lot reversal when `originalSaleId` is given: *"This return puts goods back into the same lots they were sold from."*

Add via `src/lib/help-dictionary.ts` per [[feedback_info_tips]] policy at the same time their UI surfaces ship (Tasks 9, 12, 16).
