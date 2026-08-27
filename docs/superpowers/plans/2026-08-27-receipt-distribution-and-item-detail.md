# Receipt Distribution and Item Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional colour and colour-by-size quantity distribution to supplier receipts, persist it as normalized receipt-entry allocations, and show variant, colour-only, and unresolved stock correctly on item details.

**Architecture:** Keep the shared custom item-entry grid as the editing surface. Each draft row gets an optional distribution value edited through the existing colour-list and variant-matrix primitives. Persistence stores one parent receipt entry per visible row and atomic allocation rows beneath it, then materializes operational supply lines for receiving and stock-lot snapshots.

**Tech Stack:** TanStack Start, React 19, TypeScript, Drizzle ORM/PostgreSQL, Zod, Vitest, Testing Library, existing shadcn Popover/Sheet/Drawer/Button/Input components, and the existing `ColorQuantityList`/`VariantGrid` components.

---

## File map

Create:

- `src/components/item-entry-grid/distribution-types.ts` — allocation types.
- `src/components/item-entry-grid/distribution-state.ts` — pure totals, cloning, validation, and summaries.
- `src/components/item-entry-grid/quantity-distribution-editor.tsx` — colour-only popover and colour×size responsive editor.
- `src/components/item-entry-grid/__tests__/distribution-state.test.ts` — pure state tests.
- `src/components/item-entry-grid/__tests__/quantity-distribution-editor.test.tsx` — editor interaction tests.
- `src/db/schema/supply-routes.ts` — normalized parent/allocation schema and relations.
- `src/server/functions/items/item-stock-details.ts` — item stock aggregation.
- `src/components/items/item-stock-details.tsx` — item stock/provenance UI.
- `drizzle/0025_conscious_sumo.sql` — generated SQL migration.

Modify:

- `src/db/schema/index.ts`, `src/db/schema/supply-routes.ts` — exports, source-line links, and constraints.
- `src/components/item-entry-grid/types.ts`, `item-entry-grid-state.ts`, and `item-entry-grid.tsx` — row state, deep copying, and configurable distribution action (`distributionEnabled` is true for receipts and false for opening balances).
- `src/components/supply/receipt-grid/receipt-grid.tsx` and `receipt-grid-state.ts` — receipt rendering and history integration.
- `src/components/supply/receipt-section.tsx` — draft hydration and submission adapter.
- `src/server/functions/supply/receipts.server.ts`, `routes.ts` — transactional persistence and reload grouping.
- `src/components/supply/supply-route-review.tsx`, `src/lib/supply-route-review.ts` — parent/allocation review display.
- `src/server/functions/store/receiving.ts`, `src/routes/store/receiving.tsx` — allocation-aware receiving and unresolved labels.
- `src/routes/items/$articleNumber.tsx` — item-detail loader and stock section.
- Existing state, receipt, receiving, and item server tests — regression coverage.

## Task 1: Add the normalized receipt-entry schema

**Files:** `src/db/schema/supply-routes.ts`, `src/db/schema/index.ts`, generated `drizzle` migration.

- [ ] **Step 1: Define parent and allocation tables.**

Use one `supply_route_receipt_entries` row per visible receipt-grid row. Store
item/design identity, supplier art number, total quantity, unit price, minimum
sell price, threshold, and snapshots. Use one or more
`supply_route_receipt_line_allocations` rows per entry with `kind` (`aggregate`,
`color`, or `variant`), optional colour id/name/hex, optional size, and integer
quantity. A saved aggregate entry has one null-colour/null-size allocation.

```ts
export type ReceiptAllocationKind = 'aggregate' | 'color' | 'variant'
export type ReceiptAllocation = {
  kind: ReceiptAllocationKind
  colorId: string | null
  colorName: string | null
  colorHex: string | null
  size: string | null
  quantity: number
}
```

Add foreign keys, indexes on receipt/item/entry/colour, cascade deletion from
entry to allocations, `quantity >= 0` checks, and a unique allocation key per
entry over normalized colour and size. Add `receiptAllocationId` to the
operational `supply_route_lines` table while retaining receiving and stock
foreign-key consumers and cost/minimum-sell/threshold snapshots. Keep
`receiptAllocationId` nullable for non-receipt operational lines created by
imports or requisitions; receipt writes must always populate it, and the
application must reject a missing link on a newly materialized receipt line.
Do not make the column non-null in the first migration because existing
non-receipt operational lines are valid legacy records.

- [ ] **Step 2: Generate, inspect, apply, and compile.**

```bash
pnpm db:generate
pnpm db:push
pnpm typecheck
```

Expected: the migration contains both new tables and the source link, does not
drop receiving or stock foreign keys, and typecheck exits with code 0.

- [ ] **Step 3: Commit the schema.**

```bash
git add src/db/schema/supply-routes.ts src/db/schema/index.ts drizzle
git commit -m "feat: add receipt allocation schema"
```

## Task 2: Add distribution state and copy semantics with TDD

**Files:** `distribution-types.ts`, `distribution-state.ts`, `types.ts`, `item-entry-grid-state.ts`, and their tests.

- [ ] **Step 1: Write failing pure tests.**

Cover exact colour-only totals, wrong matrix totals, duplicate normalized cells,
negative/non-integer quantities, missing colour/size values, aggregate rows,
summaries, and deep-copying through quantity fill-down.

```ts
it('accepts exact colour-only totals', () => {
  expect(validateDistribution({ mode: 'colors', cells: [
    { color: 'Red', quantity: 200 }, { color: 'Black', quantity: 300 },
  ]}, 500).valid).toBe(true)
})
it('rejects a matrix with a mismatched total', () => {
  expect(validateDistribution({ mode: 'variants', cells: [
    { color: 'Red', size: 'S', quantity: 100 },
  ]}, 150).difference).toBe(-50)
})
```

- [ ] **Step 2: Run the tests and verify the intended RED failure.**

```bash
pnpm test src/components/item-entry-grid/__tests__/distribution-state.test.ts src/components/item-entry-grid/__tests__/item-entry-grid-state.test.ts
```

Expected: new tests fail because distribution types/helpers are absent.

- [ ] **Step 3: Implement the pure state layer.**

Define `ReceiptQuantityDistribution`, `ReceiptDistributionCell`,
`distributionTotal`, `cloneDistribution`, `validateDistribution`, and
`distributionSummary`. Add `distribution: ReceiptQuantityDistribution | null`
to `ItemEntryRow`, initialize it to null, include it in blank-row detection,
and deep-clone it in `copyItemEntryRow` and quantity field copying. Quantity
edits retain distribution so the UI can show an explicit mismatch.

```ts
export type ReceiptQuantityDistribution = {
  mode: 'colors' | 'variants'
  cells: Array<{ color: string; size?: string; quantity: number }>
}
export type DistributionValidation = {
  valid: boolean; total: number; difference: number; message?: string
}
```

```bash
pnpm test src/components/item-entry-grid/__tests__/distribution-state.test.ts src/components/item-entry-grid/__tests__/item-entry-grid-state.test.ts
```

Expected: focused state tests pass.

- [ ] **Step 4: Commit the state unit.**

```bash
git add src/components/item-entry-grid
git commit -m "feat: model receipt quantity distributions"
```

## Task 3: Build and test the distribution editor

**Files:** `quantity-distribution-editor.tsx`, `item-entry-grid.tsx`,
`receipt-grid.tsx`, and editor/grid tests.

- [ ] **Step 1: Write failing component tests.**

Assert no-colour rows have no enabled action; colour-only rows open a labelled
popover; colour+size rows open a labelled side panel/bottom sheet; Apply is
disabled for mismatches; Cancel does not mutate the row; Apply creates one
summary; numeric inputs have colour/size labels; and copied distributions are
independently editable.

- [ ] **Step 2: Run the component tests and verify RED.**

```bash
pnpm test src/components/item-entry-grid/__tests__/quantity-distribution-editor.test.tsx
```

Expected: failure identifying the missing action/editor.

- [ ] **Step 3: Implement the adaptive editor.**

Compose `ColorQuantityList` for colour-only mode and `VariantGrid` for matrix
mode. Keep edits local until Apply. Use `Popover` for colour-only and
`Sheet` on desktop and `Drawer` on small screens for the matrix. If
`src/components/ui/drawer.tsx` is absent, add it with
`pnpm dlx shadcn@latest add drawer`, read the generated file, and align its
imports with the project alias. Provide title, live allocated/remaining
status, Cancel, Apply, keyboard labels, semantic foreground colours, and
contained colour-picker pointer events. Render a quantity input plus a
`Distribute quantity for row N` button. Apply calls one row-change operation.

- [ ] **Step 4: Integrate event-shaped history.**

Use this event union at the grid boundary while retaining current snapshot undo
storage:

```ts
type ReceiptGridEvent =
  | { type: 'cell-edit'; rowId: string; column: ItemEntryColumnId; value: string }
  | { type: 'distribution'; rowId: string; value: ReceiptQuantityDistribution | null }
  | { type: 'paste'; start: ItemEntryCellLocation; matrix: string[][] }
  | { type: 'fill-down'; source: ItemEntryCellLocation; destinationRows: number[] }
  | { type: 'insert-row'; rowId: string }
  | { type: 'delete-row'; rowId: string }
```

Ensure Apply/Clear, paste, fill, and delete each create one undo step; opening
or cancelling does not. Deep-clone distribution on clipboard and fill-down.

- [ ] **Step 5: Run focused UI tests and commit.**

```bash
pnpm test src/components/item-entry-grid/__tests__ src/components/supply/receipt-grid/__tests__
git add src/components/item-entry-grid src/components/supply/receipt-grid
git commit -m "feat: add receipt distribution editor"
```

Expected: focused UI/state tests pass before the commit.

## Task 4: Persist, reload, and validate allocations

**Files:** `src/components/supply/receipt-section.tsx`,
`src/server/functions/supply/receipts.server.ts`, `routes.ts`, and receipt
server tests.

- [ ] **Step 1: Add failing server tests.**

Test one parent plus two colour allocations, one parent plus a colour×size
matrix, aggregate rows, reload as one visible row, duplicate-cell rejection,
sum mismatch rejection before writes, free-text colour snapshots, item/art
reuse, supplier ownership errors, threshold `0`, replacement, and transaction
rollback. Assert later item-default changes do not change saved receipt/stock
cost or minimum-sell snapshots.

- [ ] **Step 2: Run RED tests.**

```bash
pnpm test src/server/functions/supply/__tests__/receipts.server.test.ts
```

Expected: new allocation assertions fail while existing receipt tests execute.

- [ ] **Step 3: Adapt the client payload.**

Map no distribution to one aggregate allocation, colour mode to one allocation
per colour, and matrix mode to one allocation per colour/size cell. Keep the
visible parent quantity authoritative and leave server amount/cost math intact.

- [ ] **Step 4: Implement one transactional write path.**

Repeat client validation with Zod and pure helpers; resolve/create items,
supplier art numbers, colours, and full variants; insert the parent entry and
allocations; insert one operational `supply_route_lines` row per allocation;
update item defaults once per item; and replace all related rows atomically.
Set each line’s cost, currency, amount, minimum-sell, and threshold snapshots
from the parent. Keep one source link from each operational line to its
allocation and reject duplicate variant allocations before raw SQL errors.

- [ ] **Step 5: Implement reload grouping.**

Load parent entries with their allocation rows. Return one `ItemEntryRow` per
parent; convert a single aggregate allocation to null distribution, colour
allocations to colour mode, and full cells to matrix mode. Rebuild display text from
snapshots without losing free-text colour names or hex values.

- [ ] **Step 6: Run GREEN tests and commit.**

```bash
pnpm test src/server/functions/supply/__tests__/receipts.server.test.ts
git add src/components/supply/receipt-section.tsx src/server/functions/supply/receipts.server.ts src/server/functions/supply/routes.ts src/server/functions/supply/__tests__/receipts.server.test.ts
git commit -m "feat: persist receipt allocations"
```

## Task 5: Update review and receiving without losing unresolved stock

**Files:** `src/components/supply/supply-route-review.tsx`,
`src/lib/supply-route-review.ts`, `src/server/functions/store/receiving.ts`,
`src/routes/store/receiving.tsx`, `src/server/functions/supply/items.ts`,
`src/server/functions/store/requisitions.ts`, `src/server/functions/admin/import-excel.ts`,
`src/server/functions/admin/import-prepare.ts`, `src/db/seed.ts`, and focused tests.

- [ ] **Step 1: Add failing tests for the three stock states.**

Assert review totals count each allocation once, parent entries expand without
duplicate totals, aggregate lines remain unresolved, colour-only lines show
`Size not assigned`, and full cells resolve to variants.

- [ ] **Step 2: Update queries and UI.**

Show one parent receipt entry with expandable allocation details. Retain the
existing Split action only for unresolved lines. Preserve supplier, reference,
date, prices, and quantities. Receiving must consume the materialized
allocation line and never count both a parent and child as stock.

Update split/edit/delete helpers to operate on the receipt entry plus its
allocation rows, while preserving the current `supply_route_lines` contract
for receiving, stock, transfers, notifications, audit history, imports, and
requisitions. Non-receipt operational lines keep a null allocation link.

- [ ] **Step 3: Run focused tests and commit.**

```bash
pnpm test src/server/functions/store src/components/supply src/__tests__/supply-route-review.test.ts
git add src/server/functions/store/receiving.ts src/routes/store/receiving.tsx src/components/supply/supply-route-review.tsx src/lib/supply-route-review.ts src/server/functions/supply/items.ts src/server/functions/store/requisitions.ts src/server/functions/admin/import-excel.ts src/server/functions/admin/import-prepare.ts src/db/seed.ts
git commit -m "feat: review receipt allocations in receiving"
```

## Task 6: Update item-detail stock and provenance

**Files:** `src/server/functions/items/item-stock-details.ts`,
`src/components/items/item-stock-details.tsx`, `src/routes/items/$articleNumber.tsx`,
and item-detail tests.

- [ ] **Step 1: Write failing aggregation tests.**

Assert full variant quantities/location counts, colour-only quantities labelled
`Size not assigned`, null-colour/null-size quantities labelled `Variant not
assigned`, and supplier/date/reference/cost/minimum-sell values from source
lots rather than the current item default.

- [ ] **Step 2: Implement the authenticated stock query.**

Join warehouse/shop stock, variants, colours, operational supply lines, receipt
entries, receipts, and suppliers. Return typed `variant`, `color`, and
`unresolved` groups with expandable lot records. Never fall back to the live
item minimum-sell price for an existing stock lot; preserve stored zero.

```ts
type ItemStockDetail = {
  kind: 'variant' | 'color' | 'unresolved'
  variantId: string | null
  colorName: string | null
  colorHex: string | null
  size: string | null
  quantity: number
  locations: number
  lots: Array<{ supplierName: string; receiptDate: string | null; reference: string | null; quantity: number; costUgx: string; minimumSellPriceUgx: string }>
}
```

- [ ] **Step 3: Implement and load the UI.**

Keep the current catalog identity, colours, sizes, and variant-management UI.
Add grouped stock states and expandable lot details. Separate catalog defaults
from lot values and show `Low-stock alerts disabled` for threshold `0`.

- [ ] **Step 4: Run tests and commit.**

```bash
pnpm test src/server/functions/items/__tests__/item-stock-details.test.ts
pnpm typecheck
git add src/server/functions/items/item-stock-details.ts src/server/functions/items/__tests__/item-stock-details.test.ts src/components/items/item-stock-details.tsx src/routes/items/$articleNumber.tsx
git commit -m "feat: show receipt allocation stock details"
```

Expected: item-detail tests pass and typecheck exits 0.

## Task 7: Adversarial implementation review and correction loop

- [ ] **Step 1: Re-read the design and inspect all changed code.**

Verify every saved parent has an allocation, totals match, reload returns one
row, copy/fill/paste deep-copy distributions, distribution edits are one undo
step, quantity mismatches cannot save, unresolved stock is visible, lot values
are frozen, threshold `0` is meaningful, server recalculates amounts, and
transactions roll back completely.

- [ ] **Step 2: Search for stale mappings.**

```bash
rg -l "supplyRouteLines|supply_route_lines|supplyRouteLineId|entryId" src | sort
rg -n "entryId|supplyRouteLineId|receiptAllocationId|colorId|sizeTextSnapshot|minimumSellPriceUgx|lowStockThreshold" src/server src/lib src/routes src/components src/db
rg -n "supplyRouteReceiptEntries|supplyRouteReceiptLineAllocations|receiptAllocationId" src
```

Read every listed file and add a regression test or fix for each mismatch
between parent-entry, allocation, and operational-line semantics. In
particular inspect FIFO, transfers, returns, sales, notifications, audit
history, imports, requisitions, receiving, split/edit/delete, and route review.

- [ ] **Step 3: Rerun the affected focused tests after every correction.**

## Task 8: Full verification and browser manual test

- [ ] **Step 1: Run complete static and automated verification.**

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits 0, with no formatter changes or test failures.

- [ ] **Step 2: Start the local app and use the in-app browser.**

```bash
pnpm exec vite dev --port 3000
```

Open:

```text
http://localhost:3000/supply/69483f0c-d2ac-4651-8795-2ce17aedae74/entry?step=items
```

- [ ] **Step 3: Manually test colour-only distribution.**

Click through the receipt, enter quantity `500` and colours `Red, Black`, open
Distribute, enter `200` and `300`, Apply, reopen and Cancel, and verify summary,
total pieces, review total, and readable validation for an incorrect total.

- [ ] **Step 4: Manually test matrix distribution and copying.**

Enter `Red, Black` and `S, M`, allocate all four cells, Apply, clipboard-paste
and fill the quantity cell into a new row, edit the copied matrix, and verify
the source is unchanged. Drag past the last row and verify a row is created.

- [ ] **Step 5: Manually test history, persistence, receiving, and details.**

Exercise distribution Apply/Clear, quantity mismatch, paste, fill, and delete;
verify one-step undo/redo. Save, open Review, reload, inspect the item page for
variant/colour-only/unresolved stock and lot provenance, and inspect Receiving
to confirm only unresolved lines offer later splitting.

- [ ] **Step 6: Final adversarial audit and commit.**

Run the following after all corrections:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors, no untracked production files, and every plan
requirement has direct test output or browser evidence before claiming completion.
