# Money Input Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every editable monetary field use one comma-formatting `MoneyInput`, with whole-number UGX and configurable USD/RMB decimals, without changing persisted numeric values.

**Architecture:** Keep parsing and display formatting in `src/components/ui/money-input.tsx`. Remove the duplicate `RateInput` API and represent exchange-rate prefixes through `MoneyInput`'s existing `currency` label. Migrate monetary call sites while keeping quantities and thresholds as ordinary numeric inputs.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, TanStack Router, Tailwind CSS.

---

## File map

- Modify `src/components/ui/money-input.tsx`: keep the shared formatter and remove `RateInput`.
- Modify `src/__tests__/money-input.test.tsx`: test grouping, raw callbacks, decimals, and external values.
- Modify `src/components/supply/supply-route-wizard.tsx`: replace three plain route monetary inputs.
- Modify `src/routes/supply/index.tsx`: replace route-index `RateInput` usage.
- Modify `src/routes/supply/$routeId.tsx`: replace expense and trip-rate `RateInput` usage.
- Modify `src/components/supply/add-item-form.tsx`: replace conversion-rate inputs and make aggregate quantity numeric.
- Modify `src/components/items/item-editor.tsx` and `src/routes/items/$articleNumber.tsx`: apply currency precision to item prices.
- Modify `src/components/opening-balance/opening-balance-form.tsx`: declare UGX as whole-number money.
- Modify `src/components/supply/split-item-form.tsx`: keep color quantities out of `MoneyInput`.

Precision mapping: UGX amounts/rates use `decimals={0}`; USD uses `decimals={2}`; RMB amounts use `decimals={2}`; RMB/USD rates retain `decimals={6}`. Existing `roundTo={50}` remains only on fields that already require that rounding.

## Task 1: Add failing shared-input tests

**Files:** Test `src/__tests__/money-input.test.tsx`.

- [ ] **Step 1: Add a controlled decimal-formatting test.**

```tsx
it('groups decimal values while sending the raw value', () => {
  function Harness() {
    const [value, setValue] = React.useState('')
    return <MoneyInput currency="USD" decimals={2} value={value} onChange={setValue} />
  }
  render(<Harness />)
  const input = screen.getByRole<HTMLInputElement>('textbox')
  fireEvent.change(input, { target: { value: '1234567.5' } })
  expect(input.value).toBe('1,234,567.5')
})
```

- [ ] **Step 2: Add a zero-decimal test.**

```tsx
it('does not accept decimals for whole-number money', () => {
  const onChange = vi.fn()
  render(<MoneyInput currency="UGX" decimals={0} value="" onChange={onChange} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '3750.5' } })
  expect(onChange).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Add an externally supplied-value test.**

```tsx
it('removes fractional digits from an externally supplied whole-number value', () => {
  render(<MoneyInput currency="UGX" decimals={0} value="200000.50" onChange={() => {}} />)
  expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('200,000')
})

it('formats a supplied raw large value', () => {
  render(<MoneyInput currency="UGX" decimals={0} value="200000" onChange={() => {}} />)
  expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('200,000')
})
```

- [ ] **Step 4: Run the focused test and verify the fractional external-value test fails for the intended reason.**

Run `pnpm exec vitest run src/__tests__/money-input.test.tsx`. Confirm the new external fractional-value assertion fails because the current formatter displays the decimal portion. The grouping, whole-number typing, and existing round-to tests may remain green because those behaviors already exist.

## Task 2: Consolidate the component API

**Files:** Modify `src/components/ui/money-input.tsx`; test `src/__tests__/money-input.test.tsx`.

- [ ] **Step 1: Make `MoneyInput` apply the configured precision to externally supplied values.** Pass `decimals` into the comma formatter so `decimals={0}` hides fractional digits and positive decimal limits truncate excess fractional digits. Preserve partial trailing decimals while typing. On blur, normalize the raw displayed value to the configured precision before applying `roundTo`, and emit the normalized raw value when it differs from the controlled value.

- [ ] **Step 2: Remove `RateInputProps`, `RateInput`, and their implementation.** Keep `MoneyInput`'s raw `onChange` contract, decimal filtering, comma display, blur rounding, error display, and disabled behavior unchanged. End the module with:

```tsx
export { MoneyInput }
```

- [ ] **Step 3: Run the focused test and typecheck to expose remaining imports.**

Run `pnpm exec vitest run src/__tests__/money-input.test.tsx` and `pnpm exec tsc --noEmit`. The typecheck should identify the remaining `RateInput` call sites for migration.

- [ ] **Step 4: Ensure the raw-value invariant is covered.** In the decimal test, use a `vi.fn()` callback alongside a controlled wrapper and assert the last callback is `'1234567.5'`, while the rendered value is `'1,234,567.5'`.

## Task 3: Migrate monetary call sites

**Files:** Modify `src/components/supply/supply-route-wizard.tsx`, `src/routes/supply/index.tsx`, `src/routes/supply/$routeId.tsx`, `src/components/supply/add-item-form.tsx`, `src/components/items/item-editor.tsx`, `src/routes/items/$articleNumber.tsx`, and `src/components/opening-balance/opening-balance-form.tsx`.

- [ ] **Step 1: Replace guided route basics plain inputs.** Import `MoneyInput` and use these shapes while preserving existing labels and state updates:

```tsx
<MoneyInput currency="USD" decimals={2} value={basics.budgetUsd} onChange={(value) => updateBasic('budgetUsd', value)} placeholder="0" />
<MoneyInput currency="UGX/USD" decimals={0} value={basics.rateUgxPerUsd} onChange={(value) => updateBasic('rateUgxPerUsd', value)} placeholder="e.g. 3,750" />
<MoneyInput currency="RMB/USD" decimals={6} value={basics.rateRmbPerUsd} onChange={(value) => updateBasic('rateRmbPerUsd', value)} placeholder="e.g. 7.25" />
```

- [ ] **Step 2: Replace every route `RateInput`.** In the route index and route detail screens, use `MoneyInput currency="UGX/USD" decimals={0}` for UGX rates and `MoneyInput currency="RMB/USD" decimals={6}` for RMB rates. For expense amounts retain `decimals={currency === 'UGX' ? 0 : 2}` and `roundTo={currency === 'UGX' ? 50 : undefined}`.

- [ ] **Step 3: Replace add-item conversion rates.** Use `MoneyInput currency={`${currency}/USD`} decimals={6}` for non-UGX source rates and `MoneyInput currency="UGX/USD" decimals={0}` for UGX rates. Remove `RateInput` from the import.

- [ ] **Step 4: Apply precision to item and opening-balance money fields.** For cost currency fields use `decimals={costCurrency === 'UGX' ? 0 : 2}`. For minimum selling prices and opening-balance UGX unit costs use `currency="UGX" decimals={0} roundTo={50}`. Keep all existing mutation payloads unformatted.

- [ ] **Step 5: Confirm no `RateInput` remains.** Run `rg -n "RateInput" src`; expected output is empty. Then run `pnpm exec vitest run src/__tests__/money-input.test.tsx` and `pnpm exec tsc --noEmit`; both must pass.

## Task 4: Keep quantity fields out of the money component

**Files:** Modify `src/components/supply/add-item-form.tsx` and `src/components/supply/split-item-form.tsx`.

- [ ] **Step 1: Replace aggregate quantity with ordinary numeric `Input`.** Use `type="number"`, `inputMode="numeric"`, `min={1}`, `value={aggregateQty}`, and `onChange={(event) => setAggregateQty(event.target.value)}`. Keep the existing quantity error message.

- [ ] **Step 2: Replace color quantity `MoneyInput` with ordinary numeric `Input`.** Preserve the existing `set(c.id, event.target.value)` callback, use `type="number"`, `inputMode="numeric"`, `min={0}`, and do not add a currency prefix or comma formatting.

- [ ] **Step 3: Audit all usages.** Run `rg -n -C 2 "MoneyInput" src/components src/routes` and confirm every use is a price, cost, budget, expense, or exchange rate. Quantity, count, and low-stock threshold fields must use `Input`.

## Task 5: Verify and commit

**Files:** All files modified above.

- [ ] **Step 1: Run focused tests:** `pnpm exec vitest run src/__tests__/money-input.test.tsx`.
- [ ] **Step 2: Run relevant tests:** `pnpm exec vitest run src/__tests__/supply-route-status.test.ts src/__tests__/supply-item-variants.test.ts src/__tests__/article-number.test.ts src/__tests__/item-archive.test.ts src/__tests__/item-delete.test.ts`.
- [ ] **Step 3: Run `pnpm exec tsc --noEmit`, `pnpm run lint`, and `pnpm run build`. Record any unrelated pre-existing lint failure exactly.
- [ ] **Step 4: Inspect the final diff and confirm commas never enter API payload state; only the displayed input value is formatted.**
- [ ] **Step 5: Stage only the feature files and commit with `git commit -m "feat: standardize money inputs"`.
