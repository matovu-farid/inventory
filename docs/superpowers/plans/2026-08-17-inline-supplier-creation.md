# Inline Supplier Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the item editor expose the same plus-style create affordance as the category field, open a prefilled supplier dialog, and select the newly created supplier.

**Architecture:** Extend the existing shared `Combobox` with an optional `onCreateNew` callback. Add a focused responsive supplier creation dialog that owns supplier fields and persistence. Opt the supply-route item editor into the behavior so other item-editor consumers keep their current permissions and UI.

**Tech Stack:** React 19, TypeScript, Radix UI wrappers, TanStack Start server functions, Vitest, Testing Library, pnpm.

---

### Task 1: Map the affected boundaries and add the shared combobox regression tests

**Files:**
- Modify: `src/components/ui/combobox.tsx`
- Create: `src/__tests__/combobox.test.tsx`

- [ ] **Step 1: Add failing tests for the requested create-row behavior**

Render the real `Combobox` with a small option list. Open it, type an unmatched supplier name, and assert a plus-style `Create “danny”` row appears. Select the row and assert `onCreateNew('danny')`. Add a second test asserting exact matches do not show the create row. Use the real popover/command wrappers and Testing Library `fireEvent`, matching the existing test style and avoiding a new test dependency.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm vitest run src/__tests__/combobox.test.tsx
```

Expected: the new tests fail because `Combobox` has no create callback or create row.

### Task 2: Add the supplier dialog tests

**Files:**
- Create: `src/components/supply/create-supplier-dialog.tsx`
- Create: `src/__tests__/create-supplier-dialog.test.tsx`

- [ ] **Step 1: Add failing dialog tests**

Mock `createSupplier` and render the dialog open with `initialName="danny"`. Assert the name input is prefilled, the type defaults to `international`, and the country, phone, and description fields exist. Add tests for:

```text
successful submit -> createSupplier receives trimmed fields and onCreated receives the returned id/name
cancel -> dialog closes and createSupplier is not called
rejected submit -> error is visible and the dialog remains open with entered values
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm vitest run src/__tests__/create-supplier-dialog.test.tsx
```

Expected: the tests fail because the dialog component does not exist.

### Task 3: Add the item-editor integration tests

**Files:**
- Modify: `src/__tests__/item-editor-validation.test.tsx`
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/components/supply/add-item-form.tsx`

- [ ] **Step 1: Extend test mocks with supplier creation and create-row simulation**

Mock `createSupplier` to return `{ id: 'supplier-new', name: 'Danny' }`. In the item-editor test module, make the combobox test double expose an `onCreateNew` trigger and render the current selected value. Render `ItemEditor` with `allowCreateSupplier` and assert the dialog opens from the trigger with the typed name.

- [ ] **Step 2: Add the failing integration assertion**

Submit the dialog, then assert the new supplier is selected in the item editor and the create dialog is closed. Keep a separate assertion that `ItemEditor` without `allowCreateSupplier` does not expose a create trigger.

- [ ] **Step 3: Run the focused integration test and verify RED**

Run:

```bash
pnpm vitest run src/__tests__/item-editor-validation.test.tsx
```

Expected: the integration assertions fail because the editor has no opt-in prop, dialog state, or supplier-create callback.

### Task 4: Implement the shared create-row behavior

**Files:**
- Modify: `src/components/ui/combobox.tsx`

- [ ] **Step 1: Add controlled query state and optional callback**

Add `onCreateNew?: (value: string) => void` to `ComboboxProps`. Track the command input query, clear it whenever the popover closes or an option is selected, and calculate `showCreate` only when the trimmed query is non-empty, no option label exactly matches it case-insensitively, and the callback exists.

- [ ] **Step 2: Render the category-style plus row**

Use the existing `PlusIcon`, a private sentinel command value, and the same `Create “${trimmed}”` wording used by `CreatableCombobox`. Configure the command filter so the sentinel row remains visible while cmdk filters normal options. Selecting it calls `onCreateNew(trimmed)` and closes the popover.

- [ ] **Step 3: Run combobox tests and verify GREEN**

Run:

```bash
pnpm vitest run src/__tests__/combobox.test.tsx
```

Expected: all create-row and exact-match tests pass.

### Task 5: Implement the supplier dialog

**Files:**
- Create: `src/components/supply/create-supplier-dialog.tsx`

- [ ] **Step 1: Implement the controlled responsive dialog**

Define props for `open`, `initialName`, `onOpenChange`, and `onCreated`. Maintain controlled fields for `name`, `type`, `country`, `contactPhone`, and `description`. When a new dialog request opens, set the name from `initialName`; preserve all fields while submitting or displaying an error.

- [ ] **Step 2: Persist and report the created supplier**

On submit, reject an empty trimmed name locally, call `createSupplier` with trimmed optional values omitted, then invoke `onCreated({ id, name })` with the server result. Set a pending state that disables all fields and changes the submit label to `Saving…`. Catch errors into a role-alert message without closing the dialog.

- [ ] **Step 3: Run dialog tests and verify GREEN**

Run:

```bash
pnpm vitest run src/__tests__/create-supplier-dialog.test.tsx
```

Expected: prefill, success, cancel, and failure-retention tests pass.

### Task 6: Wire the dialog into ItemEditor and the supply-route form

**Files:**
- Modify: `src/components/items/item-editor.tsx`
- Modify: `src/components/supply/add-item-form.tsx`

- [ ] **Step 1: Add opt-in editor state and callback**

Add `allowCreateSupplier?: boolean` defaulting to `false`, `supplierDialogOpen`, and `supplierCreateName`. Pass `onCreateNew` to the supplier `Combobox` only when opted in. On creation, append and sort the returned supplier in local options, set its id as `supplierId`, clear the draft name, and close the dialog.

- [ ] **Step 2: Render the dialog beside the editor**

Render `CreateSupplierDialog` with the controlled state. Keep the current supplier unchanged when canceled and use the existing editor error surface for unexpected callback failures only.

- [ ] **Step 3: Enable the flow in route item entry**

Pass `allowCreateSupplier` to both the create and edit `ItemEditor` instances inside `AddItemForm`. Do not change standalone item-page consumers, so their current supplier permissions remain unchanged.

- [ ] **Step 4: Run integration tests and verify GREEN**

Run:

```bash
pnpm vitest run src/__tests__/item-editor-validation.test.tsx src/__tests__/add-item-form-preview.test.tsx
```

Expected: the new integration tests and existing item-entry tests pass.

### Task 7: Adversarial review and verification

**Files:**
- Review: all files changed by Tasks 1–6

- [ ] **Step 1: Review the diff against the spec**

Check that the create row is only shown for unmatched non-empty text, the typed value is trimmed and prefilled, cancel/failure preserve state, success selects the supplier, and non-opted-in consumers are unchanged.

- [ ] **Step 2: Run static checks**

```bash
pnpm eslint --max-warnings 0 src/components/ui/combobox.tsx src/components/supply/create-supplier-dialog.tsx src/components/items/item-editor.tsx src/components/supply/add-item-form.tsx src/__tests__/combobox.test.tsx src/__tests__/create-supplier-dialog.test.tsx src/__tests__/item-editor-validation.test.tsx
pnpm prettier --check src/components/ui/combobox.tsx src/components/supply/create-supplier-dialog.tsx src/components/items/item-editor.tsx src/components/supply/add-item-form.tsx src/__tests__/combobox.test.tsx src/__tests__/create-supplier-dialog.test.tsx src/__tests__/item-editor-validation.test.tsx
pnpm typecheck
git diff --check
```

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass with the local PostgreSQL test database available.

- [ ] **Step 4: Fix any adversarial findings and rerun affected checks**

Do not mark the feature complete until every requirement in the spec has a passing test or direct source-level verification.
