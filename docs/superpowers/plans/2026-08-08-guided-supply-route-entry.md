# Guided Supply Route Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a resumable, auto-saving supply-route flow that lets users select or create suppliers, categories, items, and flexible purchase details while preserving existing receiving and variant behavior.

**Architecture:** Keep the existing server functions and procurement calculations as the domain boundary, then extract the current route item form into reusable components. Add a route-builder page that orchestrates route basics, suppliers, items, and review; persist only the route and completed records, not an unfinished item form. Change route lifecycle persistence to `open`/`received` and derive `partially received` from receipt rows.

**Tech Stack:** TanStack Start/Router, React 19, Drizzle/Postgres, Zod, Vitest, Cypress, Tailwind/shadcn UI.

---

## Worktree safety and baseline

The worktree already contains unrelated supplier archive changes and generated migration files. Do not reset, checkout, or stage those files unless a task explicitly modifies the same behavior. Before every commit, stage only the files listed by that task. If a task overlaps an existing dirty file, inspect the diff first and preserve the user's changes.

## File map

Create or modify files in these boundaries:

- `src/db/schema/supply-routes.ts`: persisted route lifecycle and route-line grouping/snapshot fields.
- `src/db/schema/items.ts`: item archive/category reference fields and relations.
- `src/db/schema/item-categories.ts`: durable category records and archive state.
- `src/db/schema/suppliers.ts`: preserve existing `deletedAt` work and add restore/query semantics.
- `src/server/functions/supply/routes.ts`: route creation, open-route selection, route updates, and route-supplier links.
- `src/server/functions/supply/items.ts`: route supplier overrides, route-line replacement, and line edit guards.
- `src/server/functions/supply/items-internals.ts`: pure materialization/group helpers.
- `src/server/functions/supply/suppliers.ts`: active/archived supplier selection and restore.
- `src/server/functions/items/items.server.ts`: active/archived item queries and category operations.
- `src/server/functions/items/items.ts`: client-reachable item/category server-function wrappers.
- `src/server/functions/items/categories.ts`: category create/update/archive/restore wrappers.
- `src/server/functions/store/receiving.ts` and `src/server/functions/store/receiving-internals.ts`: receipt-aware route status.
- `src/lib/supply-route-status.ts`: pure status derivation and editability rules.
- `src/components/supply/add-item-form.tsx`: extracted current flexible Add Item form.
- `src/components/supply/supply-route-wizard.tsx`: stepper orchestration and auto-save.
- `src/components/supply/supply-route-steps.tsx`: focused Route Basics, Suppliers, Items, and Review step components.
- `src/components/items/item-editor.tsx`: grouped sections, generated editable article number, and create/edit mode.
- `src/components/items/item-picker.tsx`: active/archived item display and selection.
- `src/lib/items/article-number.ts`: deterministic article-number suggestion helper.
- `src/routes/supply/index.tsx`: launch the new-route wizard and list open/partial/received labels.
- `src/routes/supply/new.tsx`: new-route wizard entry route.
- `src/routes/supply/$routeId/entry.tsx`: existing-route resume entry route.
- `src/routes/supply/$routeId.tsx`: preserve direct route detail tools while linking to the wizard.
- `src/routes/store/receiving.tsx`: display derived status labels and keep partial routes receivable.
- `drizzle/0003_guided_supply_route_entry.sql`: production migration after the existing `0002` migration.
- `src/__tests__/supply-route-status.test.ts`, `src/__tests__/article-number.test.ts`, and targeted existing tests: unit/server coverage.
- `cypress/e2e/15-guided-supply-route.cy.ts`: end-to-end flow coverage.

## Task 1: Lock down pure route lifecycle rules

**Files:**

- Create: `src/lib/supply-route-status.ts`
- Test: `src/__tests__/supply-route-status.test.ts`

- [ ] **Step 1: Write failing tests for status derivation and editability.**

```ts
import { describe, expect, it } from 'vitest'
import {
  deriveSupplyRouteDisplayStatus,
  canEditSupplyRouteLine,
  type ReceiptState,
} from '#/lib/supply-route-status'

const state = (received: number, total: number): ReceiptState => ({
  receivedLineIds: new Set(Array.from({ length: received }, (_, i) => `l${i}`)),
  totalLineIds: Array.from({ length: total }, (_, i) => `l${i}`),
})

it('derives open when no line has a receipt', () => {
  expect(deriveSupplyRouteDisplayStatus(state(0, 2))).toBe('open')
})

it('derives partially received when only some lines have receipts', () => {
  expect(deriveSupplyRouteDisplayStatus(state(1, 2))).toBe('partially_received')
})

it('derives received only when every line has a receipt', () => {
  expect(deriveSupplyRouteDisplayStatus(state(2, 2))).toBe('received')
})

it('allows editing only unreceived lines on an open route', () => {
  expect(canEditSupplyRouteLine({ routeState: 'open', received: false })).toBe(true)
  expect(canEditSupplyRouteLine({ routeState: 'open', received: true })).toBe(false)
  expect(canEditSupplyRouteLine({ routeState: 'received', received: false })).toBe(false)
})
```

- [ ] **Step 2: Run the focused test and confirm it fails because the helper is missing.**

Run: `pnpm vitest run src/__tests__/supply-route-status.test.ts`

Expected: FAIL with a module-not-found or missing-export error.

- [ ] **Step 3: Implement the pure helper.**

```ts
export type SupplyRouteDisplayStatus = 'open' | 'partially_received' | 'received'
export type ReceiptState = { receivedLineIds: Set<string>; totalLineIds: string[] }

export function deriveSupplyRouteDisplayStatus(
  state: ReceiptState,
): SupplyRouteDisplayStatus {
  if (state.totalLineIds.length > 0 && state.receivedLineIds.size >= state.totalLineIds.length) {
    return 'received'
  }
  if (state.receivedLineIds.size > 0) return 'partially_received'
  return 'open'
}

export function canEditSupplyRouteLine(input: {
  routeState: 'open' | 'received'
  received: boolean
}): boolean {
  return input.routeState === 'open' && !input.received
}
```

- [ ] **Step 4: Run the focused test and commit the pure rule.**

Run: `pnpm vitest run src/__tests__/supply-route-status.test.ts`

Expected: PASS.

```bash
git add src/lib/supply-route-status.ts src/__tests__/supply-route-status.test.ts
git commit -m "test: define supply route lifecycle rules"
```

## Task 2: Migrate route persistence and receiving semantics

**Files:**

- Modify: `src/db/schema/supply-routes.ts`
- Create: `drizzle/0003_guided_supply_route_entry.sql`
- Modify: `src/server/functions/supply/routes.ts`
- Modify: `src/server/functions/store/receiving.ts`
- Modify: `src/server/functions/store/receiving-internals.ts`
- Modify: `src/server/functions/prereqs/receiving.ts` if its route filter is status-based
- Test: `src/__tests__/receivable-routes.test.ts`, `src/__tests__/receiving-backdate.test.ts`

- [ ] **Step 1: Add failing schema/status tests for legacy migration and partial receiving.** Assert that the schema exports only `open` and `received`, old `planning`/`in_transit` rows map to `open`, and receiving one of two lines leaves the route open while receiving both changes it to received.
- [ ] **Step 2: Run the targeted tests and capture the current failures.**

Run: `pnpm vitest run src/__tests__/receivable-routes.test.ts src/__tests__/receiving-backdate.test.ts`

Expected: failures around the old enum and the current unconditional `received` update.

- [ ] **Step 3: Change the Drizzle enum and write the migration.** The migration must rename the existing enum to a temporary name, create `supply_route_status` with only `open` and `received`, cast existing values with `planning`/`in_transit` mapped to `open`, drop the temporary enum, and leave `received` unchanged. Do not edit prior migrations.
- [ ] **Step 4: Update route queries and receiving transitions.** `listSupplyRoutes` and `listReceivableRoutes` should fetch open routes and routes with outstanding lines; the receiving transaction should count receipts for every line on the route and set `received` only when all lines have a receipt. Keep partial routes persisted as `open`.
- [ ] **Step 5: Run the targeted tests and commit the migration.**

Run: `pnpm db:push:test && pnpm vitest run src/__tests__/receivable-routes.test.ts src/__tests__/receiving-backdate.test.ts`

Expected: PASS.

```bash
git add src/db/schema/supply-routes.ts drizzle/0003_guided_supply_route_entry.sql src/server/functions/supply/routes.ts src/server/functions/store/receiving.ts src/server/functions/store/receiving-internals.ts src/__tests__/receivable-routes.test.ts src/__tests__/receiving-backdate.test.ts
git commit -m "feat: simplify supply route lifecycle"
```

## Task 3: Add durable categories and archive-safe catalog queries

**Files:**

- Create: `src/db/schema/item-categories.ts`
- Modify: `src/db/schema/index.ts`
- Modify: `src/db/schema/items.ts`
- Create: `src/server/functions/items/categories.ts`
- Modify: `src/server/functions/items/items.server.ts`
- Modify: `src/server/functions/items/items.ts`
- Create: `drizzle/0004_item_categories.sql`
- Test: `src/__tests__/list-item-categories.test.ts`, `src/__tests__/item-category-archive.test.ts`

- [ ] **Step 1: Write failing tests for active/archived category selection, rename, and restore.** The tests must verify that active category options exclude archived records, renaming updates the canonical category record, and an archived category remains searchable only when explicitly requested.
- [ ] **Step 2: Run the focused tests and confirm failure.**

Run: `pnpm vitest run src/__tests__/list-item-categories.test.ts src/__tests__/item-category-archive.test.ts`

Expected: missing category table/functions or behavior mismatch.

- [ ] **Step 3: Add the category table and migration.** Create `item_categories(id, name, deleted_at, created_at, updated_at)`, backfill one row per existing `items.category`, add `items.category_id`, and backfill it. Enforce active-name uniqueness with a partial unique index `WHERE deleted_at IS NULL`, so an archived category can be recreated without violating a global unique constraint. Keep the legacy text column until all readers are migrated in this feature.
- [ ] **Step 4: Implement server queries and wrappers.** `listItemCategoriesQuery({ includeArchived })` returns canonical records; create/rename/archive/restore enforce non-empty names and reference checks. Item create/update writes both `categoryId` and the compatibility text value.
- [ ] **Step 5: Update item reads to join the category record and run tests.**

Run: `pnpm db:push:test && pnpm vitest run src/__tests__/list-item-categories.test.ts src/__tests__/item-category-archive.test.ts src/__tests__/items-create-with-min-price.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the category boundary.**

```bash
git add src/db/schema/item-categories.ts src/db/schema/items.ts src/db/schema/index.ts src/server/functions/items/categories.ts src/server/functions/items/items.server.ts src/server/functions/items/items.ts drizzle/0004_item_categories.sql src/__tests__/list-item-categories.test.ts src/__tests__/item-category-archive.test.ts
git commit -m "feat: add archive-safe item categories"
```

## Task 4: Complete archive/restore semantics for suppliers and items

**Files:**

- Preserve/modify: `src/db/schema/suppliers.ts`, `src/server/functions/supply/suppliers.ts`, `src/server/functions/supply/supplier-queries.ts`, `src/routes/supply/suppliers.tsx`
- Modify: `src/db/schema/items.ts`, `src/server/functions/items/items.server.ts`, `src/server/functions/items/items.ts`, `src/routes/items/index.tsx`, `src/routes/items/$articleNumber.tsx`
- Create: `src/__tests__/item-archive.test.ts`

- [ ] **Step 1: Add failing tests for item archive/restore and archived selection labels.** Preserve the existing dirty supplier changes; tests should cover active-only defaults, explicit archived search, and restore.
- [ ] **Step 2: Implement item `deletedAt` plus guarded archive/restore functions.** Add `archiveItem` and `restoreItem`; add `deleteItem` that hard-deletes only when no route-line, stock, sale, return, transfer, or notification foreign-key reference exists. Referenced items can always be archived, but never hard-deleted. Never cascade-delete historical inventory or procurement data.
- [ ] **Step 3: Add archived supplier/item filters and restore actions without regressing the existing supplier edits.** Inline pickers should show an Archived badge only when the user explicitly searches archived records.
- [ ] **Step 4: Run focused tests and commit.**

Run: `pnpm vitest run src/__tests__/supplier-functions.test.ts src/__tests__/supplier-schema.test.ts src/__tests__/item-archive.test.ts`

Expected: PASS.

```bash
git add src/db/schema/items.ts src/server/functions/items/items.server.ts src/server/functions/items/items.ts src/routes/items/index.tsx src/routes/items/$articleNumber.tsx src/__tests__/item-archive.test.ts
git commit -m "feat: archive catalog items safely"
```

## Task 5: Add explicit route-supplier snapshots and editable line groups

**Files:**

- Modify: `src/db/schema/supply-routes.ts`
- Modify: `src/server/functions/supply/items.ts`
- Modify: `src/server/functions/supply/items-internals.ts`
- Modify: `src/server/functions/supply/routes.ts`
- Test: `src/__tests__/supply-item-variants.test.ts`, `src/__tests__/supply-item-calculations.test.ts`, create `src/__tests__/supply-route-line-editing.test.ts`

- [ ] **Step 1: Write failing tests for route supplier overrides.** Calling materialization with `supplierId: override` must use the override; omitting it must fall back to the item's current supplier. Existing exchange-rate and cost snapshot tests must remain green.
- [ ] **Step 2: Write failing tests for editing/deleting only unreceived line groups.** The test fixture must include a route with two materialized rows for one entry, one received row, and one unreceived row; editing/deleting the group must reject any received member.
- [ ] **Step 3: Add a stable `entryId` to each materialized route purchase group.** New rows from one item entry share the same UUID. Backfill existing rows with a UUID per current item/supplier/creation group, preserve existing values, and replace the uniqueness key with a partial unique index over `(supply_route_id, entry_id, color_id, size)` using `COALESCE` for nullable color/size so a route can contain multiple purchases without collision.
- [ ] **Step 4: Implement route supplier override and transactional group replacement.** `addSupplyRouteVariants` uses `data.supplierId ?? item.supplierId`, rejects routes persisted as `received`, and creates one `entryId` for all rows from the call. `replaceSupplyRouteEntry` validates the route is `open`, verifies every row in the old group has no receipt, deletes only that group, and inserts the replacement rows in one transaction.
- [ ] **Step 5: Run focused tests and commit.**

Run: `pnpm vitest run src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts src/__tests__/supply-route-line-editing.test.ts`

Expected: PASS.

```bash
git add src/db/schema/supply-routes.ts src/server/functions/supply/items.ts src/server/functions/supply/items-internals.ts src/server/functions/supply/routes.ts src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts src/__tests__/supply-route-line-editing.test.ts
git commit -m "feat: support editable route purchase entries"
```

## Task 6: Extract the existing flexible item form without changing behavior

**Files:**

- Create: `src/components/supply/add-item-form.tsx`
- Modify: `src/routes/supply/$routeId.tsx`
- Test: existing `src/__tests__/supply-item-variants.test.ts`, create `src/components/supply/add-item-form.test.tsx` only if the component can be rendered without database setup

- [ ] **Step 1: Copy the current `AddItemForm` behavior into the focused component and write a regression test for the three detail modes.** Preserve `ItemPicker`, `ColorQuantityList`, `VariantGrid`, exchange-rate validation, inline color creation, and the existing `ItemEditor` callback.
- [ ] **Step 2: Run existing supply item tests before changing behavior.**

Run: `pnpm vitest run src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts`

Expected: PASS on the extracted implementation.

- [ ] **Step 3: Replace the local form in `$routeId.tsx` with the extracted component and keep the current direct Add Item dialog working.** Do not alter unrelated route-detail rendering.
- [ ] **Step 4: Run typecheck and focused tests, then commit the extraction.**

Run: `pnpm typecheck && pnpm vitest run src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts`

Expected: PASS.

```bash
git add src/components/supply/add-item-form.tsx src/routes/supply/$routeId.tsx src/__tests__/supply-item-variants.test.ts src/__tests__/supply-item-calculations.test.ts
git commit -m "refactor: extract supply item entry form"
```

## Task 7: Implement item identity, grouped sections, and article suggestions

**Files:**

- Create: `src/lib/items/article-number.ts`
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/components/items/item-picker.tsx`
- Test: `src/__tests__/article-number.test.ts`

- [ ] **Step 1: Write failing article suggestion tests.** Cover category/name normalization, punctuation removal, collision suffixes against a supplied `existingArticleNumbers` set, and preserving a user-edited value.
- [ ] **Step 2: Implement a pure suggestion helper.** Example contract:

```ts
export function suggestArticleNumber(input: {
  category: string
  name: string
  existingArticleNumbers?: ReadonlySet<string>
}): string {
  const words = `${input.category}-${input.name}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const base = words.slice(0, 64) || 'ITEM'
  if (!input.existingArticleNumbers?.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, 64 - String(suffix).length - 1)}-${suffix}`
    if (!input.existingArticleNumbers.has(candidate)) return candidate
  }
}
```

- [ ] **Step 3: Add grouped expandable sections to `ItemEditor`.** Reorder the entry sequence to current supplier → category → item name → description, then article suggestion, commercial profile, and variants. Keep all current validation and the current create payload intact.
- [ ] **Step 4: Add edit mode using `updateItem` for selected existing items.** Keep item-profile changes separate from route purchase values. Mark archived selected records visibly and require explicit confirmation before restoring/using them.
- [ ] **Step 5: Run item tests, typecheck, and commit.**

Run: `pnpm vitest run src/__tests__/article-number.test.ts src/__tests__/items-create-with-min-price.test.ts src/__tests__/list-item-categories.test.ts && pnpm typecheck`

Expected: PASS.

```bash
git add src/lib/items/article-number.ts src/components/items/item-editor.tsx src/components/items/item-picker.tsx src/__tests__/article-number.test.ts
git commit -m "feat: group item entry and suggest article numbers"
```

## Task 8: Build the route wizard and auto-save boundary

**Files:**

- Create: `src/components/supply/supply-route-wizard.tsx`
- Create: `src/components/supply/supply-route-steps.tsx`
- Create: `src/routes/supply/new.tsx`
- Create: `src/routes/supply/$routeId/entry.tsx`
- Modify: `src/routes/supply/index.tsx`
- Modify: `src/routes/supply/$routeId.tsx`
- UI coverage: `cypress/e2e/15-guided-supply-route.cy.ts` (created in Task 9).

- [ ] **Step 1: Write the failing UI contract tests or Cypress skeleton.** The first test must assert the four step labels, Save and exit visibility, and three entry choices. The existing route flow must remain available as a fallback until this task is complete.
- [ ] **Step 2: Implement a route-loader contract.** The new route entry route loads the selected route, open routes ordered by `createdAt desc`, active suppliers, active categories, and item picker data. The new-route route creates an open route after the user submits the route name, then navigates to its entry path.
- [ ] **Step 3: Implement the horizontal stepper and entry choices.** Most recent route is prominent but requires a click. Existing routes open directly to Items with an Edit route details link. New routes start at Route Basics.
- [ ] **Step 4: Implement debounced route auto-save.** Use a `useRef<ReturnType<typeof setTimeout> | null>` timer per route form; send only changed fields to `updateSupplyRoute`; keep a `saveState` union of `idle | saving | saved | error` and preserve form state on failure. Do not add a new debounce dependency.
- [ ] **Step 5: Implement the Suppliers step.** Show linked route suppliers, active/archived search, create inline with essential fields, and add the resulting supplier link immediately.
- [ ] **Step 6: Implement the Items step.** Use the extracted current form with grouped item sections, route-specific supplier selection, completed-entry summary, edit/delete actions, and Add another item. Do not persist an incomplete item form.
- [ ] **Step 7: Implement Review and Finish route.** Load the latest route snapshot, show warnings, allow Back/Edit, Save and exit, and mark the route complete only through the receipt lifecycle; Finish route is a navigation/completion action, not a false physical-trip status change.
- [ ] **Step 8: Add route-list and detail links.** New Route opens the wizard; open/partial routes show Continue setup; fully received routes do not show item-entry actions.
- [ ] **Step 9: Run typecheck and the UI build boundary.**

Run: `pnpm typecheck && pnpm build`

Expected: PASS. UI orchestration is verified by the dedicated Cypress spec in Task 9.

- [ ] **Step 10: Commit the wizard UI.**

```bash
git add src/components/supply/supply-route-wizard.tsx src/components/supply/supply-route-steps.tsx src/routes/supply/new.tsx src/routes/supply/$routeId/entry.tsx src/routes/supply/index.tsx src/routes/supply/$routeId.tsx src/__tests__/supply-route-wizard.test.tsx
git commit -m "feat: add guided supply route wizard"
```

## Task 9: Add end-to-end coverage and adversarial implementation review

**Files:**

- Create: `cypress/e2e/15-guided-supply-route.cy.ts`
- Modify: targeted source/tests found during review

- [ ] **Step 1: Write Cypress scenarios for the complete user journey.** Cover new route, most-recent route selection, multiple suppliers, inline supplier/category creation, generated/editable article number, existing item edit separation, all three procurement detail modes, save/exit/resume, adding across days, partial receiving, and locked received lines.
- [ ] **Step 2: Run the Cypress spec against the test database.**

Run: `pnpm test:e2e --spec cypress/e2e/15-guided-supply-route.cy.ts`

Expected: PASS.

- [ ] **Step 3: Run an adversarial review against the implementation.** Inspect the full diff and explicitly check:
  - no old `planning`/`in_transit` comparisons remain in active code;
  - no route supplier override is ignored or overwritten by item current supplier;
  - received lines cannot be edited/deleted through any entry point;
  - partial routes remain resumable and receivable;
  - archived records are excluded by default but explicitly discoverable;
  - auto-save failures preserve values and do not duplicate completed entries;
  - aggregate/color/color-size materialization still computes costs identically;
  - direct route-detail Add Item behavior still works;
  - no dirty user changes were staged accidentally.
- [ ] **Step 4: Fix every finding with a regression test first, rerun the focused test, then rerun the full verification suite.**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: all commands PASS.

- [ ] **Step 5: Commit the final tests and review fixes.** Run `git diff --name-only`, confirm every listed feature path is intentional, then stage `cypress/e2e/15-guided-supply-route.cy.ts` and each exact reviewed feature path individually. Never use a directory-wide `git add` because the worktree contains unrelated changes. Commit with `git commit -m "test: verify guided supply route workflow"`.

## Final verification checklist

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e --spec cypress/e2e/15-guided-supply-route.cy.ts`
- [ ] `git diff --check`
- [ ] `git status --short` confirms unrelated pre-existing changes remain unstaged unless intentionally integrated.
