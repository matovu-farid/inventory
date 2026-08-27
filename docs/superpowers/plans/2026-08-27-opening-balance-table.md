# Opening Balance Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the warehouse and shop opening-balance block forms with one fast, receipt-style editable table that preserves existing stock and accounting behavior.

**Architecture:** Add a pure opening-balance table state/adapter module for flat row editing and conversion to the existing grouped server payload. Replace the shared form’s nested block rendering with the table, reusing catalog comboboxes, `MoneyInput`, and shadcn table primitives; keep the existing server mutations and journal logic intact.

**Tech Stack:** TanStack Start, React, TypeScript, Zod, Drizzle, shadcn/ui, Vitest, in-app browser.

---

### Task 1: Add the flat opening-balance row model and pure state helpers

**Files:**
- Create: `src/components/opening-balance/opening-balance-table-state.ts`
- Test: `src/components/opening-balance/__tests__/opening-balance-table-state.test.ts`

- [ ] **Step 1: Write failing tests** for `createEmptyOpeningBalanceRow`, `validateOpeningBalanceRows`, `calculateOpeningBalanceRowAmount`, `groupOpeningBalanceRows`, duplicate item/variant detection, colour/size pair validation, and fill-down expansion beyond the current last row.
- [ ] **Step 2: Run the focused state test and confirm it fails** because the new module does not exist.
- [ ] **Step 3: Implement the minimal pure helpers** with a row shape containing `itemId`, selected `ItemSummary`, optional `colorId`, optional `size`, `variantId`, quantity, unit cost, minimum sell price, and low-stock threshold. `groupOpeningBalanceRows` must emit the existing `{ itemId, unitCostUgx, cells }[]` payload and reject duplicate `(itemId, variantId/colorId+size/unresolved)` keys rather than silently merging different costs.
- [ ] **Step 4: Run the focused state test and confirm it passes.**

### Task 2: Build the reusable opening-balance table

**Files:**
- Create: `src/components/opening-balance/opening-balance-table.tsx`
- Test: `src/components/opening-balance/__tests__/opening-balance-table.test.tsx`
- Modify: `src/components/items/item-picker.tsx` only if a small accessibility/compact-trigger prop is required

- [ ] **Step 1: Write failing component tests** for item selection, derived display columns, colour/size comboboxes, amount calculation, add-line, trailing-row activation, delete-line, and disabled state.
- [ ] **Step 2: Run the focused component test and confirm it fails.**
- [ ] **Step 3: Implement the table** with shadcn `Table`, `Combobox`, `MoneyInput`, `Input`, accessible labels, and row-local item/colour/size controls. Render a persistent blank trailing row and an explicit Add opening-balance line button. Item search must query the server as the combobox query changes and cache the selected option.
- [ ] **Step 4: Add local undo/redo history and fill-down controls** using the pure state helpers; make fill-down append rows when dragged/clicked beyond the current data rows, including item, colour, size, quantity, unit cost, minimum sell price, and threshold.
- [ ] **Step 5: Run the focused component test and confirm it passes.**

### Task 3: Replace the shared form’s block editor with the table adapter

**Files:**
- Modify: `src/components/opening-balance/opening-balance-form.tsx`
- Modify: `src/components/opening-balance/opening-balance-table.tsx`
- Test: `src/__tests__/opening-balance-form.test.tsx`

- [ ] **Step 1: Write failing form tests** for warehouse and shop rendering, shop selection, grouping table rows into the current server payload, confirmation totals, and pending-state disabling.
- [ ] **Step 2: Run the focused form test and confirm it fails.**
- [ ] **Step 3: Replace `DraftBlock` state and nested `VariantGrid`/`ColorQuantityList` rendering** with flat table rows and the table callback. Keep shop selection, success/error messages, confirmation dialog, and both server mutations. Prefill commercial fields from the selected catalog item and pass row minimum-sell/threshold values through the adapter.
- [ ] **Step 4: Guard shop changes** by requiring confirmation and clearing populated draft rows before switching destination; add an accessible live validation message and focus the first invalid control.
- [ ] **Step 5: Run the focused form test and all existing opening-balance tests.**

### Task 4: Adversarial implementation review and corrections

**Files:**
- Review all files changed in Tasks 1–3.

- [ ] **Step 1: Review the diff against the design** for lost unresolved-stock support, incorrect grouping, duplicate database conflicts, variant ownership gaps, server-search coverage, keyboard/focus regressions, accessible names/errors, unsafe shop switching, and accidental catalog-default edits.
- [ ] **Step 2: Add regression tests for every concrete finding.**
- [ ] **Step 3: Fix the implementation and rerun the focused tests.**

### Task 5: Verification and browser acceptance

**Files:**
- No source changes unless verification finds a defect.

- [ ] **Step 1: Run `pnpm typecheck`.**
- [ ] **Step 2: Run `pnpm lint`.**
- [ ] **Step 3: Run the focused state, component, form, and opening-balance server tests.**
- [ ] **Step 4: Use the in-app browser to navigate to `/store/opening-balance`, interact with the table, and verify the rendered controls and totals without posting data.**
- [ ] **Step 5: Repeat the browser flow at `/shop/opening-balance`, including shop selection.**
- [ ] **Step 6: Run `git diff --check` and inspect the final diff.**

### Task 6: Commit

**Files:**
- All intended files from Tasks 1–5.

- [ ] **Step 1: Commit with `git add -A` and `git commit -m "feat: add opening balance item table"`.**
- [ ] **Step 2: Verify the working tree is clean and record the commit hash.**
