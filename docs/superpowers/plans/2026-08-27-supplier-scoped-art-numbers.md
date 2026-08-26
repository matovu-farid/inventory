# Supplier-scoped art numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable supplier codes, globally unique qualified art numbers, supplier-scoped ranked receipt search, and separate item-name/design entry.

**Architecture:** Keep the visible normalized art number for UI compatibility and add a qualified internal value composed from an immutable supplier code. Resolve receipt rows using supplier + item name + design + visible art number, while querying catalog candidates only for the selected supplier. Extend the existing custom receipt table with an item-name column and preserve fill-down, paste, undo/redo, color, size, and save behavior.

**Tech Stack:** TanStack Start server functions, Drizzle PostgreSQL schema/migrations, Zod, React, the existing custom receipt table and shadcn UI components, Vitest, TypeScript, ESLint, and the in-app browser.

---

### Task 1: Add supplier-code schema and generation helpers

**Files:**
- Create: `src/db/schema/supplier-codes.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/db/schema/suppliers.ts`
- Create: `src/lib/suppliers/supplier-code.ts`
- Test: `src/lib/suppliers/__tests__/supplier-code.test.ts`

- [ ] **Step 1: Write the failing tests**

Test `generateSupplierCode()` with a mocked secure-random source and assert exactly eight `A-Z` characters. Test `isSupplierCode()` accepts `ABCDEFGH` and rejects lowercase, digits, punctuation, and other lengths. Test `qualifiedArticleNumber('abcdefgh', ' jacket 101 ')` returns `ABCDEFGH:JACKET 101`.

- [ ] **Step 2: Run the tests and verify the expected failure**

```bash
pnpm exec vitest run src/lib/suppliers/__tests__/supplier-code.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the helper and schema**

Use `crypto.getRandomValues` with the alphabet `ABCDEFGHIJKLMNOPQRSTUVWXYZ`. Add `supplierCodes` with `supplierId` as its primary key, `code` as a unique text field, and created/updated timestamps. Add the one-to-one supplier relation and export the schema.

- [ ] **Step 4: Run the tests and verify they pass**

Run the same Vitest command and expect all helper tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/supplier-codes.ts src/db/schema/index.ts src/db/schema/suppliers.ts src/lib/suppliers/supplier-code.ts src/lib/suppliers/__tests__/supplier-code.test.ts
git commit -m "feat: add supplier code identity"
```

### Task 2: Migrate article numbers to qualified identity

**Files:**
- Modify: `src/db/schema/item-article-numbers.ts`
- Modify: `src/lib/items/article-number.ts`
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/routes/items/$articleNumber.tsx`
- Modify: `src/components/items/item-card.tsx`
- Create: `drizzle/0019_supplier_scoped_article_numbers.sql`
- Modify: generated files under `drizzle/meta/`
- Test: `src/__tests__/supplier-scoped-article-numbers.test.ts`

- [ ] **Step 1: Write failing database tests**

Create two suppliers and two items with the same visible art number. Assert their qualified values differ. Assert a second item cannot use the same visible number for the same supplier. Assert `formatItemArticleNumbers()` still returns only visible numbers.

- [ ] **Step 2: Run the tests and verify the expected failure**

```bash
pnpm exec dotenv -e .env.test -- vitest run src/__tests__/supplier-scoped-article-numbers.test.ts
```

Expected: FAIL because the supplier-code table and qualified column do not exist.

- [ ] **Step 3: Update schema and migration**

Add `qualifiedArticleNumber` to `itemArticleNumbers`, remove the global unique index on raw `articleNumber`, and add a unique index on `qualifiedArticleNumber`. Generate a migration that creates `supplier_codes`, backfills every current supplier with a unique eight-letter code, adds the qualified column, fills it by joining article numbers to their item supplier code, then applies `NOT NULL` and the new unique index. Keep raw values unchanged.

Update every direct article-number fixture that currently inserts only `itemId` and `articleNumber` so it supplies the qualified value through a shared test helper. The affected fixtures include `src/__tests__/test-helpers.ts`, `src/lib/notifications/__tests__/baseline.test.ts`, `src/__tests__/receive-unresolved.test.ts`, `src/__tests__/receiving-backdate.test.ts`, `src/__tests__/server-variant-id.test.ts`, `src/__tests__/opening-balance-shop-unresolved.test.ts`, `src/__tests__/set-item-minimum-sell-price.test.ts`, `src/__tests__/notifications-variant-id.test.ts`, `src/__tests__/shift-reports.test.ts`, `src/__tests__/item-return-date-filter.test.ts`, `src/__tests__/stock-variant-id.test.ts`, `src/__tests__/specify-stock.test.ts`, `src/__tests__/materialize-variants.test.ts`, `src/__tests__/photo-handoff.test.ts`, `src/__tests__/delete-variant.test.ts`, `src/__tests__/audit-article-resolver.test.ts`, `src/__tests__/opening-balance-auto-create.test.ts`, `src/__tests__/low-stock-flow.test.ts`, `src/__tests__/variants.test.ts`, `src/__tests__/plan-2c-low-stock-item-level.test.ts`, `src/__tests__/item-color-images.test.ts`, `src/__tests__/item-images.test.ts`, and `src/__tests__/products-server.test.ts`.

- [ ] **Step 4: Keep UI formatting raw**

`normalizeArticleNumber()` continues normalizing the visible value. `qualifiedArticleNumber(code, visible)` creates the stored internal value. `formatItemArticleNumbers()` and `primaryItemArticleNumber()` continue returning `articleNumber` only.

Change item-detail lookup and links to use the qualified article number internally. `getItemByArticleQuery()` must accept and resolve the qualified value; item cards and item-list links must pass it, while all rendered labels continue using the visible value.

- [ ] **Step 5: Run the tests and verify they pass**

Apply the schema to the test database with `pnpm db:push:test`, then run the same test command and expect all tests to pass.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/item-article-numbers.ts src/lib/items/article-number.ts src/__tests__/supplier-scoped-article-numbers.test.ts drizzle
git commit -m "feat: qualify article numbers by supplier"
```

### Task 3: Generate codes for every supplier-creation path

**Files:**
- Modify: `src/server/functions/supply/suppliers.ts`
- Modify: `src/server/functions/admin/import-excel.ts`
- Modify: `src/db/seed.ts`
- Test: `src/server/functions/supply/__tests__/suppliers.server.test.ts`

- [ ] **Step 1: Write failing tests**

Create suppliers through the server function and assert a matching `supplier_codes` row exists and contains eight uppercase letters. Create a second supplier and assert codes differ. Exercise the import helper path and assert it also has a code. Force a code collision and assert generation retries.

- [ ] **Step 2: Run the tests and verify the expected failure**

```bash
pnpm exec dotenv -e .env.test -- vitest run src/server/functions/supply/__tests__/suppliers.server.test.ts
```

Expected: FAIL because supplier creation currently inserts only `suppliers`.

- [ ] **Step 3: Implement transactional creation**

Insert the supplier and its code in one transaction. Retry only code generation on a unique-code violation. Update import and seed production paths to create or reuse the mapping; never replace an existing code.

- [ ] **Step 4: Run the tests and verify they pass**

Run the same command and expect all supplier tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/supply/suppliers.ts src/server/functions/admin/import-excel.ts src/db/seed.ts src/server/functions/supply/__tests__/suppliers.server.test.ts
git commit -m "feat: generate supplier codes on creation"
```

### Task 4: Make item and receipt persistence supplier-aware

**Files:**
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/server/functions/items/items.ts`
- Modify: `src/server/functions/supply/receipts.server.ts`
- Modify: `src/server/functions/supply/items.ts`
- Test: `src/__tests__/supplier-scoped-article-numbers.test.ts`
- Test: `src/server/functions/supply/__tests__/receipts.server.test.ts`

- [ ] **Step 1: Add failing persistence tests**

Test item creation writes the visible and qualified values. Test a second number for the same supplier/item succeeds. Test the same visible number for a different supplier succeeds. Test the same visible number for another item under the same supplier fails with the owning design. Test a matching receipt restock reuses the existing item without a false conflict.

- [ ] **Step 2: Run the tests and verify the expected failure**

```bash
pnpm exec dotenv -e .env.test -- vitest run src/__tests__/supplier-scoped-article-numbers.test.ts src/server/functions/supply/__tests__/receipts.server.test.ts
```

Expected: FAIL because writes still compare raw values globally.

- [ ] **Step 3: Implement supplier-aware writes and resolution**

Load the selected supplier code before inserting or comparing. Compare ownership by selected supplier plus normalized raw value and write the qualified value. In receipt resolution, first look up the selected supplier’s qualified number; reuse its item when item name and design match. Otherwise reuse an existing selected-supplier item matching item name and design and add the new mapping; otherwise create the item and mapping. Preserve stale-item and same-supplier conflict errors.

When an existing item changes supplier, requalify all of that item’s article numbers inside the same transaction before updating the supplier. Reject the update if any qualified value would collide with another item.

- [ ] **Step 4: Run the tests and verify they pass**

Run the same command and expect all persistence tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/items/items.server.ts src/server/functions/items/items.ts src/server/functions/supply/receipts.server.ts src/server/functions/supply/items.ts src/__tests__/supplier-scoped-article-numbers.test.ts src/server/functions/supply/__tests__/receipts.server.test.ts
git commit -m "fix: scope article ownership to suppliers"
```

### Task 5: Add supplier-scoped ranked catalog search

**Files:**
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/server/functions/items/items.ts`
- Modify: `src/server/functions/supply/routes.ts`
- Modify: `src/routes/supply/$routeId/entry.tsx`
- Modify: `src/lib/supply-receipts.ts`
- Test: `src/__tests__/supplier-item-search.test.ts`

- [ ] **Step 1: Write failing search tests**

Seed two suppliers with overlapping visible art numbers and several names/designs. Search with supplier A and assert supplier B never appears. Assert exact article-number matches precede prefix matches, which precede partial article-number matches, which precede exact design matches, prefix design matches, and partial design matches. Assert item name is returned but does not outrank art-number/design matches. Assert an empty supplier returns no rows.

- [ ] **Step 2: Run the tests and verify the expected failure**

```bash
pnpm exec dotenv -e .env.test -- vitest run src/__tests__/supplier-item-search.test.ts
```

Expected: FAIL because search is currently global and design-only ranking is not defined.

- [ ] **Step 3: Implement scoped ranked search**

Add optional `supplierId` to the item-search input and filter items by that supplier. Rank using SQL `CASE` over raw article-number exact/prefix/contains and design exact/prefix/contains in that order. Return item name, design, visible article numbers, colours, and variants. Add a receipt catalog-index query accepting a supplier id and remove the route loader’s unscoped full-catalog fetch so a new receipt does not load every art number.

- [ ] **Step 4: Run the tests and verify they pass**

Run the same command and expect all search tests to pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/functions/items/items.server.ts src/server/functions/items/items.ts src/server/functions/supply/routes.ts 'src/routes/supply/$routeId/entry.tsx' src/lib/supply-receipts.ts src/__tests__/supplier-item-search.test.ts
git commit -m "feat: scope and rank supplier item search"
```

### Task 6: Extend receipt rows with item name and scoped selection

**Files:**
- Modify: `src/components/supply/receipt-grid/types.ts`
- Modify: `src/components/supply/receipt-grid/receipt-grid-state.ts`
- Modify: `src/components/supply/receipt-grid/receipt-grid.tsx`
- Modify: `src/components/supply/receipt-section.tsx`
- Modify: `src/components/supply/supply-route-wizard.tsx`
- Modify: `src/lib/supply-receipts.ts`
- Test: `src/components/supply/__tests__/receipt-section.test.tsx`
- Test: `src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts`

- [ ] **Step 1: Write failing grid and section tests**

Add a row-state test proving item name survives copy/fill-down/paste. Add a component test proving the columns are `Item name`, `Design`, `Art No.`, `Colour`, `Size`, `Qty (pcs)`, `Unit Price`, and `Amount`. Test that a catalog selection fills item name, design, and art number. Test free-text validation requires item name and design. Test the search request includes the selected supplier id and an empty supplier issues no request.

- [ ] **Step 2: Run the tests and verify the expected failure**

```bash
pnpm exec vitest run src/components/supply/__tests__/receipt-section.test.tsx src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts
```

Expected: FAIL because rows have no item name and the design editor searches globally.

- [ ] **Step 3: Implement the receipt-grid changes**

Add `itemName` to `ReceiptGridRow`, `ReceiptGridColumnId`, copy/paste/fill-down logic, and empty-row validation. Render an editable item-name cell before design. Keep the design editor as the catalog-search trigger, pass supplier id to the scoped ranked search, and show item name, design, and article numbers in each result. Selecting a result updates both text fields, item id, catalog metadata, and the article number when unambiguous. Keep both inputs editable for free text.

- [ ] **Step 4: Wire draft and snapshots**

Load item name from `line.item.name` or `itemNameSnapshot`, send it in `receiptLineInput`, require it for free-text lines, and write `itemNameSnapshot` from the row. Remove the unscoped `initialCatalogIndex` prop and pass the selected supplier to scoped search/validation. Keep existing colour/size controls and Excel-like row actions unchanged.

- [ ] **Step 5: Run the tests and verify they pass**

Run the same command and expect all grid and section tests to pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/supply/receipt-grid/types.ts src/components/supply/receipt-grid/receipt-grid-state.ts src/components/supply/receipt-grid/receipt-grid.tsx src/components/supply/receipt-section.tsx src/components/supply/supply-route-wizard.tsx src/lib/supply-receipts.ts src/components/supply/__tests__/receipt-section.test.tsx src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts
git commit -m "feat: add item name to receipt entry"
```

### Task 7: Adversarial implementation review and fixes

**Files:**
- Review all files changed in Tasks 1–6
- Test: all affected unit, server, and component test files

- [ ] **Step 1: Inspect the complete diff and search for missed assumptions**

```bash
git diff origin/main...HEAD -- src db drizzle docs
rg -n "uq_item_article_numbers_value|articleNumber.*unique|lower\(.*article|searchItems\(|listReceiptCatalogIndex\(" src drizzle
```

Check that no active write path inserts an article number without a qualified value, no screen displays the qualified value, no receipt route loads an unscoped catalog, and all production supplier insert paths create or reuse a code.

- [ ] **Step 2: Run complete verification**

```bash
pnpm test -- src/__tests__/supplier-scoped-article-numbers.test.ts src/__tests__/supplier-item-search.test.ts src/server/functions/supply/__tests__/receipts.server.test.ts src/server/functions/supply/__tests__/suppliers.server.test.ts src/components/supply/__tests__/receipt-section.test.tsx src/components/supply/receipt-grid/__tests__
pnpm run typecheck
pnpm run lint
pnpm run build
```

- [ ] **Step 3: Fix each finding and repeat review**

For every finding, add a focused failing test, implement the correction, rerun that test, then repeat the complete commands. Review specifically for migration failures, duplicate ownership, supplier leakage in search, item-name loss in snapshots, and UI regressions.

- [ ] **Step 4: Commit review fixes**

```bash
git add -A
git commit -m "fix: close supplier art number review findings"
```

### Task 8: Manual browser verification

**Files:**
- No source changes unless a browser finding requires a new TDD fix
- Evidence: in-app browser at `http://localhost:3000/supply`

- [ ] **Step 1: Open an open supply route and select Items**

Confirm a new receipt does not show catalog results before a supplier is selected.

- [ ] **Step 2: Verify scoped ranked search**

Select a supplier, type an existing art number, and confirm the dropdown shows only that supplier’s item. Type a design and confirm design matches appear after art-number matches. Confirm every result shows item name, design, and art numbers.

- [ ] **Step 3: Verify row population and free text**

Select a result and confirm item name, design, and art number populate the row. Add another row and enter item name, design, new art number, colour, comma-separated size, quantity, and unit price. Confirm amount and totals calculate.

- [ ] **Step 4: Verify save and review**

Save the receipt, wait for the save overlay to complete, open Review, and confirm supplier, item name, design, raw art number, colour, size, quantity, unit price, and amount are correct. Confirm no qualified prefix leaks into the UI.

- [ ] **Step 5: Verify duplicate semantics**

On a second receipt for the same supplier, use the same art number and matching item; confirm it is accepted as a restock. On a different supplier, use the same visible art number; confirm it is accepted as a separate supplier-scoped identifier.

## Adversarial plan review record

The plan was reviewed against the requested behavior and the current codebase before implementation. The following failure modes were found and explicitly covered:

- Raw art numbers can be duplicated across suppliers, so raw-number item routes would be ambiguous. Task 2 moves internal item links to the qualified value while retaining raw display labels.
- Changing an item’s supplier would leave its old prefix unless handled transactionally. Task 4 requalifies all of the item’s article numbers and tests collisions.
- Direct article-number inserts exist in many integration fixtures. Task 2 lists those fixtures and requires a shared qualified-value helper rather than weakening the database constraint.
- Supplier creation also occurs through import and seed paths, not only the supplier form. Task 3 updates and tests each production path and preserves existing codes.
- A global route-loader catalog would defeat supplier scoping. Task 5 removes the unscoped fetch and Task 6 verifies no request is made before supplier selection.
- Existing receipt lines may lack a separate item-name snapshot. Task 6 defines fallback loading from the catalog item and preserves the visible snapshot for review.
- The user’s “item name” clarification means name is the broad category and design is the specific style. The schema, validation, search result, column order, and receipt creation steps all use that distinction.
- A migration cannot qualify an article number whose item has no supplier. Task 2 must check this condition before enforcing `NOT NULL` and report the count rather than silently creating an incorrect identity.

No unresolved placeholders, contradictory ranking rules, unowned files, or untested explicit requirements remain in the plan.
