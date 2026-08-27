# Receipt Item Commercial Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimum sell price and low-stock threshold to receipt entry, update item defaults on save, and guarantee existing stock keeps immutable cost and minimum-sell-price snapshots.

**Architecture:** Keep item-level values as current defaults and receipt/stock values as snapshots. Extend the existing custom receipt grid and receipt server contract, make low-stock threshold non-null with a database default of zero, and remove live-item fallback from stock movement and sales calculations.

**Tech Stack:** TanStack Start, React, TypeScript, Drizzle ORM/PostgreSQL, Zod, BigNumber, Vitest, existing shadcn `Input`/`MoneyInput` components.

---

### Task 1: Extend the receipt data contract and grid state

**Files:**
- Modify: `src/components/supply/receipt-grid/types.ts`
- Modify: `src/components/supply/receipt-grid/receipt-grid-state.ts`
- Modify: `src/components/supply/receipt-grid/receipt-grid.tsx`
- Modify: `src/components/supply/receipt-section.tsx`
- Modify: `src/components/supply/receipt-section.tsx` fallback column list
- Test: `src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts`

- [ ] **Step 1: Write failing state tests**

Add tests that assert a new row has `minimumSellPriceUgx: ''` and
`lowStockThreshold: 0`, that copying a row copies both fields, and that an
empty row containing only threshold `0` is still empty.

```ts
expect(createEmptyReceiptRow('x')).toMatchObject({
  minimumSellPriceUgx: '',
  lowStockThreshold: 0,
})
```

- [ ] **Step 2: Run the focused state tests**

Run:

```bash
pnpm exec vitest run src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts --reporter=dot
```

Expected: the new assertions fail because the fields do not exist.

- [ ] **Step 3: Extend row types and copy/fill behavior**

Add `minimumSellPriceUgx` and `lowStockThreshold` to `RECEIPT_GRID_COLUMNS`,
`ReceiptGridRow`, and `ReceiptGridCatalogItem`. Initialize threshold to `0` in
`createEmptyReceiptRow`; include both fields in `isReceiptRowEmpty`,
`copyReceiptRowField`, and cell parsing. Treat an empty threshold edit as `0`.

- [ ] **Step 4: Add the two editable columns**

Add columns titled `Min sell price (UGX)` and `Low-stock threshold` after unit
price. Use `MoneyInput` with `decimals={0}` and `roundTo={50}` for minimum sell
price, and a numeric `Input` with `min={0}`, `step={1}`, and `inputMode="numeric"`
for the threshold. Keep `text-foreground` and visible placeholders so values
remain readable. Update copy/paste, fill-down, delete, totals, and the SSR
fallback column count.

- [ ] **Step 5: Populate defaults from catalog selection and receipt reload**

When a design selection supplies a catalog item, copy its
`minimumSellPriceUgx` and `lowStockThreshold ?? 0` into the row. When loading an
existing receipt, use the joined item defaults when present and otherwise use
`0`. Preserve the values in `cloneReceiptDraft` and history undo/redo.

- [ ] **Step 6: Run the focused state tests again**

Expected: all state tests pass, including fill-down and paste behavior for the
new columns.

### Task 2: Persist item defaults and receipt snapshots

**Files:**
- Modify: `src/server/functions/supply/receipts.server.ts`
- Modify: `src/server/functions/supply/receipts.ts`
- Modify: `src/components/supply/receipt-section.tsx`
- Modify: `src/components/supply/supply-route-review.tsx`
- Modify: `src/lib/supply-route-review.ts`
- Test: `src/server/functions/supply/__tests__/receipts.server.test.ts`
- Test: `src/components/supply/receipt-grid/__tests__/receipt-grid.test.tsx`

- [ ] **Step 1: Write failing server regression tests**

Add tests for:

```ts
const first = await createSupplyRouteReceiptServer({
  ...draft('Snapshot design', 'SNAP-1'),
  lines: [{
    itemName: 'Shirt', design: 'Snapshot design', articleNumber: 'SNAP-1',
    minimumSellPriceUgx: '12000', lowStockThreshold: 5,
    quantity: 10, unitPriceForeign: '20',
  }],
})

const second = await createSupplyRouteReceiptServer({
  ...draft('Snapshot design', 'SNAP-1'),
  lines: [{
    itemName: 'Shirt', design: 'Snapshot design', articleNumber: 'SNAP-1',
    minimumSellPriceUgx: '15000', lowStockThreshold: 8,
    quantity: 10, unitPriceForeign: '25',
  }],
})
```

Assert the item defaults are `15000` and `8`, the first receipt line remains
`12000` with threshold `5`, and the second line is `15000` with threshold `8`.
Use different receipt costs/rates and assert those receipt-line cost snapshots
are also preserved. Add a duplicate-row test that expects conflicting defaults
for the same resolved item to be rejected, while identical duplicate rows are
allowed as separate lots.

- [ ] **Step 2: Run the focused server tests to verify RED**

Run:

```bash
pnpm exec dotenv -e .env.test -o -- vitest run src/server/functions/supply/__tests__/receipts.server.test.ts --reporter=dot
```

Expected: the new assertions fail because the server contract and update logic
do not yet persist these fields.

- [ ] **Step 3: Extend and validate the server schemas**

Add `minimumSellPriceUgx` as an optional non-negative numeric string and
`lowStockThreshold` as an optional integer with `min(0)` to both server-side
receipt input validators. Keep compatibility for older callers by treating an
omitted minimum price as the current item value, or `0` for a new item, and an
omitted threshold as the current item value, or `0` for a new item.
Treat minimum sell price `0` as “no floor”; sale prices themselves remain
strictly positive.

- [ ] **Step 4: Update item defaults in the transaction**

In `resolveReceiptLineItem`, resolve the item first, compute the effective
defaults, and update `items.costPrice`, `items.costCurrency`,
`items.minimumSellPriceUgx`, and `items.lowStockThreshold`. Do not use these
updated item values when building the current receipt line’s snapshot; use the
line’s effective minimum price, threshold, cost, and currency instead. Track
resolved item defaults in the transaction and throw:

```text
Receipt contains conflicting defaults for the same item
```

when the same item is entered twice with different minimum sell prices or
thresholds.

- [ ] **Step 5: Send grid fields and expose them in review**

Include both fields in the `ReceiptSection` draft payload. Extend the review
line input and review table so each receipt row shows `Minimum sell price` and
`Low-stock threshold`; retain the existing projected-profit calculation based
on the receipt snapshot. The receipt threshold is historical display data;
low-stock behavior continues to use the live item threshold.

- [ ] **Step 6: Run the focused tests to verify GREEN**

Expected: receipt server and receipt-section tests pass, including new-item,
restock, reload, and conflict cases.

### Task 3: Make low-stock defaults explicit in the database

**Files:**
- Modify: `src/db/schema/items.ts`
- Modify: `src/db/schema/supply-routes.ts`
- Create: the migration generated by `pnpm db:generate` for these schema changes
- Test: `src/server/functions/supply/__tests__/receipts.server.test.ts`

- [ ] **Step 1: Write the migration contract test/check**

Add a database-backed assertion that an inserted item without an explicit
threshold reads back `0`, that a receipt line without an explicit threshold
reads back `0`, and that `NULL` is no longer accepted.

- [ ] **Step 2: Make the schema non-null with a zero default**

Change the Drizzle fields to:

```ts
lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
```

Add the same non-null/default declaration to
`supplyRouteLines.lowStockThreshold`.

- [ ] **Step 3: Generate and inspect the migration**

Run:

```bash
pnpm db:generate
```

The migration must backfill existing nulls before adding either constraint:

```sql
UPDATE "items" SET "low_stock_threshold" = 0
WHERE "low_stock_threshold" IS NULL;
ALTER TABLE "items" ALTER COLUMN "low_stock_threshold" SET DEFAULT 0;
ALTER TABLE "items" ALTER COLUMN "low_stock_threshold" SET NOT NULL;
UPDATE "supply_route_lines" SET "low_stock_threshold" = 0
WHERE "low_stock_threshold" IS NULL;
ALTER TABLE "supply_route_lines" ALTER COLUMN "low_stock_threshold" SET DEFAULT 0;
ALTER TABLE "supply_route_lines" ALTER COLUMN "low_stock_threshold" SET NOT NULL;
```

- [ ] **Step 4: Run the database contract test**

Expected: omitted thresholds read as `0` and null inserts fail.

### Task 4: Make every stock writer and consumer snapshot-safe

**Files:**
- Modify: `src/server/functions/shop/sales.ts`
- Modify: `src/server/functions/store/transfers.ts`
- Modify: `src/server/functions/store/receiving.ts`
- Modify: `src/server/functions/store/returns.ts`
- Modify: `src/server/functions/admin/opening-balance.server.ts`
- Modify: `src/db/seed.ts`
- Modify: `src/routes/shop/index.tsx`
- Modify: `src/routes/pos.tsx`
- Modify: `src/components/pos/variant-picker-sheet.tsx`
- Modify: `src/lib/pos/checkout-validate.ts`
- Modify: `src/server/functions/items/prices.ts`
- Modify: `src/routes/items/$articleNumber.tsx`
- Modify: `src/routes/store/index.tsx`
- Test: `src/server/functions/store/__tests__/stock-price-snapshots.test.ts`
- Test: `src/server/functions/shop/__tests__/sale-price-snapshots.test.ts`
- Test: nearest existing POS and item-detail tests, adding exact files if none exist

- [ ] **Step 1: Write failing snapshot-invariance tests**

Create stock with stored cost `20`, minimum sell price `12000`, and another lot
with stored cost `25`, minimum sell price `0`; update the item defaults to
`15000`, then assert receiving, returns, FIFO/sale/transfer planning, and POS
validation still use each stored snapshot. Also assert a stored `0` remains
`0` and does not fall back to `15000`.

- [ ] **Step 2: Run the focused movement tests to verify RED**

Run these focused tests (create the exact test files before implementation):

```bash
pnpm exec vitest run src/server/functions/store/__tests__/stock-price-snapshots.test.ts src/server/functions/shop/__tests__/sale-price-snapshots.test.ts --reporter=dot
```

Expected: the `0` snapshot case fails because current code falls back to the
item default.

- [ ] **Step 3: Use the allocation snapshot unconditionally**

Replace conditional expressions of the form:

```ts
snapshot.gt(0) ? snapshot : new BigNumber(item.minimumSellPriceUgx)
```

with the stored allocation value. Keep item queries only for labels and item
identity. Transfer allocations and destination shop stock must copy the exact
source allocation snapshot. Update every writer (receiving, opening balance,
returns, transfers, and seed/test fixtures) to set cost and minimum-price
snapshots explicitly. When multiple lots are used together, retain the current
maximum lot-floor policy; all zero floors mean no floor.

- [ ] **Step 4: Clarify item UI labels**

Show item defaults as `Current item default` and stock rows as `Stock lot
minimum`, using the row snapshot. Keep low-stock status based on the live item
threshold and display `0` as disabled/no alert.

- [ ] **Step 5: Run the focused movement tests to verify GREEN**

Expected: old lots remain unchanged after item defaults change, including zero
minimum-sell-price lots.

### Task 5: Standardize item editing and low-stock semantics

**Files:**
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/server/functions/items/prices.ts`
- Modify: `src/server/functions/supply/items.ts`

- [ ] **Step 1: Make threshold non-null in application code**

Normalize loaded `null` values to `0`, default new item forms to `0`, and never
send `null` back to the database. A threshold of `0` disables the alert.

- [ ] **Step 2: Standardize zero minimum-price behavior**

Allow item defaults and stock snapshots to be `0` as “no floor”, while keeping
sale price validation strictly positive. Update item pricing, receipt, shop,
and POS validation consistently.

- [ ] **Step 3: Run item and pricing tests**

Assert that editing an item default does not mutate any existing stock row and
that zero is accepted as an unset minimum floor.

### Task 6: Adversarial implementation review and verification

**Files:**
- Review all files changed in Tasks 1–5

- [ ] **Step 1: Review invariants line by line**

Search for every read and write of `minimumSellPriceUgx`, `costPrice`, and
`lowStockThreshold`. Confirm that no stock/sale/POS path can substitute a live
item default for a stock snapshot, every stock writer sets snapshots
explicitly, and every receipt entry path sets threshold `0` when blank.

```bash
rg -n "minimumSellPriceUgx|costPrice|lowStockThreshold" src | sort
```

- [ ] **Step 2: Review the diff for UI regressions**

Check keyboard editing, fill-down, paste, row deletion, disabled/save overlay,
horizontal scroll, visible text colour, accessible labels, and review rendering
with both zero and non-zero values.

- [ ] **Step 3: Fix every finding and rerun focused tests**

Do not accept a warning as harmless if it could alter a historical stock value
or make receipt entry ambiguous.

- [ ] **Step 4: Run the complete applicable checks**

```bash
pnpm typecheck
pnpm lint
pnpm exec prettier --check src/db/schema/items.ts src/server/functions/supply/receipts.ts src/server/functions/supply/receipts.server.ts src/components/supply/receipt-section.tsx src/components/supply/receipt-grid/receipt-grid.tsx src/lib/supply-route-review.ts
pnpm exec dotenv -e .env.test -o -- vitest run --exclude src/__tests__/request-access-rate-limiter.integration.test.ts --reporter=dot
git diff --check
```

Expected: zero type errors, zero lint errors, formatted changed files, all
applicable tests passing, and no whitespace errors.

### Task 7: Manual browser test

**Files:** None

- [ ] **Step 1: Open the local receipt editor**

Use `http://localhost:3000/supply`, open an open route, and add/edit a receipt.

- [ ] **Step 2: Verify entry behavior**

Confirm the receipt grid shows `Min sell price (UGX)` and `Low-stock threshold`,
new rows show threshold `0`, the minimum price formats with commas, and both
cells support typing, paste, undo/redo, and fill-down.

- [ ] **Step 3: Verify persistence and review**

Enter a new item with minimum sell price `12,000`, threshold `5`, save, reload,
and confirm the values remain in the receipt and review. Open the item page and
confirm the item defaults are `12,000` and `5`.

- [ ] **Step 4: Verify snapshot isolation**

Create or inspect stock from the receipt, change the item default to `15,000`
through a later receipt, and confirm the earlier stock lot still displays and
uses `12,000`. Confirm threshold changes affect the live low-stock indicator.

- [ ] **Step 5: Record evidence and finish**

Capture the final browser URL/state, test output, and `git status`. Commit the
implementation with:

```bash
git add -A
git commit -m "feat: add receipt item commercial settings"
```
