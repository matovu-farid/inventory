# Shared Item Entry Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supplier Routes, Warehouse opening balance, and Shop opening balance use one configurable receipt-style item-entry grid, including free-text item creation for opening balances.

**Architecture:** Extract the current custom receipt grid into a shared `ItemEntryGrid` and shared row/state helpers. Receipt and opening-balance forms provide mode-specific labels, search scope, totals, validation, and save adapters. The grid uses exactly one history owner: if the parent passes `historyControls`, the parent owns undo/redo; otherwise the grid owns local history. Extend the opening-balance transaction so rows without an `itemId` create a supplier-neutral catalog item, article number, colours, variants, and immutable stock snapshots atomically.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, Drizzle ORM/Postgres, Zod, Vitest, shadcn/ui `Table`, `Combobox`, `MoneyInput`, `Popover`, and the existing local browser testing workflow.

---

## File map

- Create `src/components/item-entry-grid/types.ts`: shared row, column, mode, catalog-item, and history-control types.
- Create `src/components/item-entry-grid/item-entry-grid-state.ts`: shared row creation, parsing, blank-row handling, amount calculation, paste, fill-down, and validation primitives.
- Create `src/components/item-entry-grid/item-entry-grid.tsx`: the only table interaction/rendering implementation, including design search, colour picker, fill handle, add/delete, undo/redo, and accessible cell editors.
- Modify `src/components/supply/receipt-grid/receipt-grid.tsx`: reduce to a compatibility wrapper around `ItemEntryGrid` or remove duplicated implementation after imports are migrated.
- Modify `src/components/supply/receipt-grid/receipt-grid-state.ts`, `src/components/supply/receipt-grid/types.ts`, and their tests: re-export shared names or migrate tests to the shared module without retaining duplicate logic.
- Modify `src/components/supply/receipt-section.tsx`: map receipt drafts to the shared row model and configure receipt mode.
- Modify `src/components/opening-balance/opening-balance-form.tsx`: own opening destination and submit adapter while using shared rows/grid.
- Modify `src/components/opening-balance/opening-balance-table.tsx`: replace the duplicated table with the shared grid configured for opening mode.
- Modify `src/components/opening-balance/opening-balance-table-state.ts`: adapt shared rows to opening-balance validation/grouping, including free-text item fields.
- Modify `src/server/functions/admin/opening-balance.server.ts`: accept row-oriented existing/free-text item inputs and create missing catalog data in the same transaction.
- Modify `src/server/functions/admin/opening-balance.ts`: expose the updated server-function input inferred from the server-only schema.
- Modify `src/components/opening-balance/__tests__/opening-balance-table-state.test.ts` and create/update component/server tests for both modes.

## Task 1: Establish shared row/state contracts with failing tests

**Files:**
- Create: `src/components/item-entry-grid/types.ts`
- Create: `src/components/item-entry-grid/item-entry-grid-state.ts`
- Test: `src/components/item-entry-grid/__tests__/item-entry-grid-state.test.ts`
- Modify: `src/components/supply/receipt-grid/types.ts`
- Modify: `src/components/supply/receipt-grid/receipt-grid-state.ts`

- [ ] **Step 1: Add shared state tests before implementation.** Cover these exact cases:

```ts
it('creates a row with opening-safe defaults', () => {
  expect(createEmptyItemEntryRow('row-1')).toMatchObject({
    itemName: '', design: '', articleNumber: '', quantity: null,
    unitPriceForeign: '', minimumSellPriceUgx: '', lowStockThreshold: 0,
    colorIds: [],
  })
})

it('fills down a value beyond the last row and leaves a trailing blank row', () => {
  const next = fillDownItemEntryCells(
    [row('one', { articleNumber: 'JKT-1' })],
    { row: 0, column: 'articleNumber' },
    [1, 2],
  )
  expect(next.map((entry) => entry.articleNumber)).toEqual(['JKT-1', 'JKT-1', 'JKT-1'])
  expect(next.at(-1)?.id).not.toBe('one')
})

it('parses quantity and threshold as non-negative whole numbers', () => {
  expect(updateItemEntryCell([row('one')], 0, 'quantity', '4')[0].quantity).toBe(4)
  expect(updateItemEntryCell([row('one')], 0, 'lowStockThreshold', '')[0].lowStockThreshold).toBe(0)
})
```

- [ ] **Step 2: Run the focused test and verify it fails because shared functions do not exist.**

Run: `pnpm exec vitest run src/components/item-entry-grid/__tests__/item-entry-grid-state.test.ts`

Expected: FAIL with unresolved shared-module exports.

- [ ] **Step 3: Implement the shared types/state helpers.** Use the existing receipt helpers as the source of behavior, but rename them around `ItemEntryRow` and `ITEM_ENTRY_COLUMNS`. Preserve immutable cloning of nested catalog item data, comma-separated colour/size text, receipt amount calculation, opening UGX amount calculation through the same raw cost field, `add...Row`, `remove...Row`, `ensure...Rows`, `applyPasteMatrix`, `fillDown...Cells`, and validation. Add `ItemEntryGridMode = 'receipt' | 'opening-balance'` and a mode-specific validator that requires a design and art number for both modes, positive quantity, and positive cost.

- [ ] **Step 4: Make the old receipt state module a compatibility re-export.** Export aliases for `ReceiptGridRow`, `ReceiptGridColumnId`, `createEmptyReceiptRow`, `validateReceiptRows`, and all existing receipt helper names from the shared module so receipt imports and current tests continue to compile while the UI migration is in progress.

- [ ] **Step 5: Run shared and existing receipt state tests.**

Run: `pnpm exec vitest run src/components/item-entry-grid/__tests__/item-entry-grid-state.test.ts src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the shared contracts/state.**

Run: `git add src/components/item-entry-grid src/components/supply/receipt-grid/types.ts src/components/supply/receipt-grid/receipt-grid-state.ts && git commit -m "refactor: share item entry grid state"`

## Task 2: Extract the shared grid renderer without changing receipt behavior

**Files:**
- Create: `src/components/item-entry-grid/item-entry-grid.tsx`
- Test: `src/components/item-entry-grid/__tests__/item-entry-grid.test.tsx`
- Modify: `src/components/supply/receipt-grid/receipt-grid.tsx`

- [ ] **Step 1: Add component tests for the shared interactions.** Verify accessible labels and these behaviors using the existing mocked `searchItems` pattern:

```ts
it('shows configured opening labels and keeps editor text dark', () => {
  render(<Harness mode="opening-balance" />)
  expect(screen.getByText('Unit cost (UGX)')).toBeInTheDocument()
  expect(screen.getByLabelText('Design row 1')).toHaveClass('text-foreground')
})

it('selects a catalog result and fills item fields', async () => {
  render(<Harness mode="opening-balance" />)
  await user.click(screen.getByLabelText('Design row 1'))
  await user.type(screen.getByLabelText('Design row 1'), 'Jacket')
  await user.click(await screen.findByText('Jacket'))
  expect(onRowsChange).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ itemId: 'item-1', itemName: 'Press Jacket', design: 'Jacket' }),
  ]))
})
```

Also cover add line, trailing-row activation, delete, paste matrix, fill-down growth, undo/redo, comma-separated colours/sizes, picker pointer interaction, and disabled state. Add a test where the mocked catalog search rejects after text has been entered; the design input must still contain the user's text and the editor must remain usable.

- [ ] **Step 2: Run the new component test and verify it fails before extraction.**

Run: `pnpm exec vitest run src/components/item-entry-grid/__tests__/item-entry-grid.test.tsx`

Expected: FAIL because `ItemEntryGrid` is not implemented.

- [ ] **Step 3: Move the table implementation into `ItemEntryGrid`.** Port the current `ReceiptGrid` implementation and its `EditableTableCell`, `PlainCellInput`, `DesignEditor`, `ColorEditor`, and picker helpers. Keep the custom colour wheel pointer containment fix intact. Replace hardcoded receipt labels/totals with a configuration object:

```ts
type ItemEntryGridConfig = {
  mode: 'receipt' | 'opening-balance'
  supplierId?: string
  costLabel: string
  amountLabel: string
  totalLabel: string
  currency: 'foreign' | 'UGX'
}
```

Use `design` search for both modes; pass `supplierId` only for receipts. Selecting a catalog item must populate item name, design, article number when there is exactly one, catalog item, min sell price, threshold, and existing colour/variant context. Free-text edits must clear stale `itemId`/catalog data without losing the text the user entered. When `historyControls` is supplied, all grid undo/redo buttons and shortcuts call only those callbacks; otherwise local history is the sole owner.

- [ ] **Step 4: Replace `ReceiptGrid` with a thin wrapper.** The wrapper passes receipt mode, the existing supplier id, and receipt labels/totals to `ItemEntryGrid`; it contains no table event or cell-rendering logic.

- [ ] **Step 5: Run all existing grid tests.**

Run: `pnpm exec vitest run src/components/item-entry-grid/__tests__/item-entry-grid-state.test.ts src/components/item-entry-grid/__tests__/item-entry-grid.test.tsx src/components/supply/receipt-grid/__tests__/receipt-grid-state.test.ts src/components/supply/receipt-grid/__tests__/receipt-grid.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the shared renderer.**

Run: `git add src/components/item-entry-grid src/components/supply/receipt-grid/receipt-grid.tsx && git commit -m "refactor: extract shared item entry grid"`

## Task 3: Adapt Supplier Routes to the shared grid

**Files:**
- Modify: `src/components/supply/receipt-section.tsx`
- Test: `src/components/supply/__tests__/receipt-section.test.tsx`
- Test: `src/server/functions/supply/__tests__/receipts.server.test.ts`

- [ ] **Step 1: Add/adjust receipt regression tests.** Assert that receipt rows still map item name/design/article number, supplier-scoped search receives the selected supplier id, free-text receipt rows retain their entered values in the payload, and a newly entered art number becomes a second supplier-qualified alias for the selected item. Assert that an alias owned by another item in the same supplier scope is rejected while the same visible art number under another supplier remains valid.

- [ ] **Step 2: Migrate receipt imports to shared row/state types.** Keep `ReceiptGrid` as the public wrapper initially so draft history and save code remain unchanged. Confirm the wrapper receives the same rows and history controls.

- [ ] **Step 3: Run receipt section and server regression tests.**

Run: `pnpm exec vitest run src/components/supply/__tests__/receipt-section.test.tsx src/server/functions/supply`

Expected: PASS.

- [ ] **Step 4: Commit receipt compatibility.**

Run: `git add src/components/supply/receipt-section.tsx src/components/supply/__tests__/receipt-section.test.tsx src/server/functions/supply && git commit -m "refactor: run receipts on shared item grid"`

## Task 4: Replace the opening-balance table and adapt its state

**Files:**
- Modify: `src/components/opening-balance/opening-balance-table-state.ts`
- Modify: `src/components/opening-balance/opening-balance-table.tsx`
- Modify: `src/components/opening-balance/opening-balance-form.tsx`
- Test: `src/components/opening-balance/__tests__/opening-balance-table-state.test.ts`
- Test: `src/components/opening-balance/__tests__/opening-balance-table.test.tsx`

- [ ] **Step 1: Add failing opening-row tests for the shared shape.** Cover free-text `itemName`, `design`, and `articleNumber`, existing catalog selection, shared validation, UGX amount totals, and grouping rows into opening payload entries. A free-text row must be valid with no `itemId` when it has design, art number, positive quantity, and positive cost. Assert field-specific errors for missing design, art number, quantity, cost, invalid minimum sell price, and invalid threshold; assert empty trailing rows are ignored and threshold defaults to `0`.

- [ ] **Step 2: Update opening-balance state to use shared rows.** Keep an opening-specific adapter for grouping and duplicate detection. Map `unitPriceForeign` to `unitCostUgx` only at the submit boundary, so the grid remains shared. Preserve existing colour/size pair validation and variant id resolution. When a catalog item is selected, use its existing min sell price and threshold as defaults; for free text default min sell price to `0` and threshold to `0`.

- [ ] **Step 3: Replace the opening table JSX with `ItemEntryGrid`.** Configure opening mode with `Unit cost (UGX)`, `Amount (UGX)`, whole-number UGX money input, unscoped item search, and opening totals. Keep the form’s `validationError`, `disabled`, `resetToken`, and row-change API. The shared grid must render the same item name/design/art/colour/size/quantity/commercial columns as receipts.

- [ ] **Step 4: Update `OpeningBalanceForm` submit mapping.** Do not require `itemId` in client validation for a free-text row. Submit each populated shared row with item name/design/art number, colour text/hex, size text, quantity, unit cost, minimum sell price, and threshold. Preserve shop selection confirmation, centered pending overlay, summary, and reset behavior.

- [ ] **Step 5: Run focused opening-balance tests.**

Run: `pnpm exec vitest run src/components/opening-balance/__tests__/opening-balance-table-state.test.ts src/components/opening-balance/__tests__/opening-balance-table.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the opening UI adapter.**

Run: `git add src/components/opening-balance && git commit -m "refactor: use shared grid for opening balances"`

## Task 5: Add atomic free-text item creation to opening-balance mutations

**Files:**
- Modify: `src/server/functions/admin/opening-balance.server.ts`
- Modify: `src/server/functions/admin/opening-balance.ts`
- Modify: `src/__tests__/opening-balance-auto-create.test.ts`
- Modify: `src/__tests__/opening-balance.test.ts`
- Modify: `src/__tests__/opening-balance-variants.test.ts`

- [ ] **Step 1: Add server tests before implementation.** Cover:

```ts
it('creates a supplier-neutral item for a free-text opening row', async () => {
  const result = await addStoreOpeningBalanceQuery({
    items: [{
      itemId: null,
      itemName: 'Shirt',
      design: 'Round neck',
      articleNumber: 'T-8989',
      colorText: 'Cream, Charcoal',
      colorHex: '#fffdd0, #36454f',
      size: 'S, M, L',
      quantity: 75,
      unitCostUgx: '28000',
      minimumSellPriceUgx: '35000',
      lowStockThreshold: 0,
    }],
  }, userId)
  expect(result.itemCount).toBe(1)
  // Database assertions verify item.supplierId is null, raw article number,
  // colours/variants, stock cost snapshot, and minimum-sell snapshot.
})
```

Also cover existing-item reuse, adding a supplier-qualified alias to an existing supplier-owned item, adding an unqualified alias to an existing supplier-neutral item, rejection when an alias belongs to another item in the relevant scope, colour/size materialization, duplicate cells, threshold default `0`, explicit threshold updates, and rollback when a later row is invalid. The rollback test must assert that the newly created item, article mapping, colours, variants, stock rows, journal entries, and audit record are all absent after the transaction fails.

- [ ] **Step 2: Extend the Zod input.** Opening entries accept nullable optional `itemId` plus required `design` and `articleNumber` for free-text creation, optional `itemName`, colour text/hex, and size text. Normalize and validate colour hex lists using the existing receipt colour helpers. Keep the shop id contract unchanged.

- [ ] **Step 3: Implement transaction-local item resolution.** For each entry:
  - If `itemId` is present, load the active item and verify the entered design/article data does not attach the row to a different item.
  - If the entered article number is not already attached to the selected item, add it under that item's supplier code when the item has a supplier, or as an unqualified mapping when it is supplier-neutral, after checking scoped ownership.
  - If `itemId` is null, first look for an existing active supplier-neutral item with the same normalized design and article number; reuse it when both match.
  - Otherwise insert `items` with `supplierId: null`, `name: itemName || design`, `design`, `costPrice` from the UGX unit cost, `costCurrency: 'UGX'`, minimum sell price, and threshold, then insert an unqualified `itemArticleNumbers` row.
  - Materialize missing colours from entered name/hex pairs and variants from the normalized comma-separated sizes. Reuse existing case-insensitive colours and variants.
  - Lock or re-check the design/article lookup inside the transaction so concurrent saves cannot create duplicate supplier-neutral rows.

- [ ] **Step 4: Preserve immutable stock and accounting semantics.** Pass the resolved item id into existing normalization/posting code. Insert `store_stock` or `shop_stock` with the row’s cost and minimum-sell snapshot. Update live item defaults only from explicit submitted values; do not rewrite existing stock. Keep balanced journal and audit writes in the same transaction. Add a transaction-conflict test that submits the same new supplier-neutral art number twice and verifies one succeeds and the other returns the ownership error rather than creating duplicate catalog rows.

- [ ] **Step 5: Run server tests and typecheck.**

Run: `pnpm exec vitest run src/__tests__/opening-balance-auto-create.test.ts src/__tests__/opening-balance.test.ts src/__tests__/opening-balance-variants.test.ts && pnpm exec tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the persistence change.**

Run: `git add src/server/functions/admin/opening-balance.server.ts src/server/functions/admin/opening-balance.ts src/__tests__/opening-balance-auto-create.test.ts src/__tests__/opening-balance.test.ts src/__tests__/opening-balance-variants.test.ts && git commit -m "feat: create opening balance catalog items"`

## Task 6: Adversarial implementation review and corrective pass

**Files:** All files changed in Tasks 1–5.

- [ ] **Step 1: Run the full relevant automated suite.**

Run: `pnpm exec vitest run src/components/item-entry-grid src/components/supply/receipt-grid src/components/supply/__tests__ src/components/opening-balance src/server/functions/admin src/server/functions/supply src/__tests__/opening-balance-auto-create.test.ts src/__tests__/opening-balance.test.ts src/__tests__/opening-balance-variants.test.ts && pnpm exec tsc --noEmit`

- [ ] **Step 2: Review the diff against the spec requirement-by-requirement.** Check specifically that there is one renderer, opening balance has free-text creation, supplier search remains scoped only for receipts, colours/hex and sizes persist, cost/minimum-sell snapshots are immutable, threshold defaults to zero, parent-vs-local history has one owner, field-specific validation and search-error preservation are covered, and no stale opening-only editor remains.

- [ ] **Step 3: Run a read-only adversarial code review.** Ask a reviewer to inspect for duplicate grid logic, wrong supplier/article ownership, transaction rollback gaps, stale item context after free-text edits, pointer-dismissal regressions, inaccessible labels, incorrect totals, and disabled-state holes. Record each finding by file and line.

- [ ] **Step 4: Fix every valid finding and rerun the focused tests.** No finding is closed by intent; each is closed by a changed test or code plus a passing command.

- [ ] **Step 5: Commit the corrective pass.**

Run: `git add src && git commit -m "fix: harden shared item entry flows"`

## Task 7: Manual browser testing

**Files:** None unless browser testing finds a defect.

- [ ] **Step 1: Confirm the local app is running at `http://localhost:3000`.** Use the in-app browser skill and persistent browser state; do not use standalone Playwright or the live site.

- [ ] **Step 2: Test Supplier Routes.** Open `http://localhost:3000/supply/69483f0c-d2ac-4651-8795-2ce17aedae74/entry?step=items` and click through Items. Search an existing item by art number and design, select it, type a free-text row, enter comma-separated colours and sizes, open the picker and drag its pointer without dismissal, add/delete a row, click the trailing row, fill a value beyond the current last row, undo/redo, trigger a search failure if the local mock/server permits it and verify typed text remains, save the receipt, and move to Review. Verify item name, design, art number, colours, sizes, quantities, amounts, and commercial values are shown.

- [ ] **Step 3: Test Warehouse opening balance.** Open `/store/opening-balance`; use the same table, select an existing catalog item, create a free-text item, verify the opening labels and UGX totals, exercise add/delete/fill-down/undo/redo, verify missing-design/art-number/quantity/cost messages identify the row, open the confirmation, then cancel so no test stock is posted. Catalog/item persistence is verified by server tests rather than posting disposable browser data.

- [ ] **Step 4: Test Shop opening balance.** Open `/shop/opening-balance`; verify the same grid and shop selector, switch shops with populated rows to confirm the warning, cancel the switch, and open/cancel the submit confirmation.

- [ ] **Step 5: Fix browser-found defects immediately and repeat the affected path.** Capture the visible symptom and retest the exact reproduction after each fix. Always cancel opening-balance confirmations during this manual pass; persistence behavior is covered by server tests so the browser pass does not post disposable inventory.

## Task 8: Final verification and commit

- [ ] **Step 1: Run formatting/lint/typecheck and focused tests.**

Run: `pnpm exec prettier --check src/components/item-entry-grid src/components/opening-balance src/components/supply/receipt-grid src/server/functions/admin/opening-balance.server.ts && pnpm exec tsc --noEmit && pnpm exec vitest run src/components/item-entry-grid src/components/opening-balance src/components/supply/receipt-grid src/server/functions/admin src/__tests__/opening-balance-auto-create.test.ts src/__tests__/opening-balance.test.ts src/__tests__/opening-balance-variants.test.ts`

Expected: PASS.

- [ ] **Step 2: Inspect the final diff and status.**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors; only intentional committed history; branch is clean.

- [ ] **Step 3: Commit any final verified changes.**

Run: `git add src && git commit -m "feat: share item entry grid across inventory"`

- [ ] **Step 4: Report the implementation commits, automated results, browser paths tested, and any remaining limitation.**
