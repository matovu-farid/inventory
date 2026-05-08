# UGX Display Rounding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every UGX value to a multiple of 50 shillings — single values floor toward zero, totals/KPIs use banker's rounding — without touching DB schema or accounting math.

**Architecture:** A small set of helpers in `src/lib/format.ts` (two pure math functions returning `BigNumber`, two string formatters with `" UGX"` suffix). Every existing display callsite is migrated to the right helper based on whether the surrounding UI already declares the UGX label. `MoneyInput` gains an opt-in `roundTo` prop that floors the value on blur. Storage and server math are unchanged.

**Tech Stack:** TypeScript, React 19, BigNumber.js, Vitest, @testing-library/react, TanStack Router.

**Spec:** `docs/superpowers/specs/2026-05-08-ugx-rounding-design.md`

**Helper choice rule (used throughout the migration tasks):**

| Surrounding UI context | Helper to use |
|---|---|
| Cell inside a table whose column header reads `... (UGX)` | `roundUgxFloor50(x).toFormat(0)` (no suffix) |
| Cell summing the column ("Total" footer) inside a `(UGX)`-headed table | `roundUgxBankers50(x).toFormat(0)` (no suffix) |
| KPI card with a sibling `<p>UGX</p>` label | Drop the sibling, use `formatUgxTotal(x)` |
| Inline text with `UGX` prefix or suffix in JSX | Drop the inline `UGX`, use `formatUgx(x)` (line item) or `formatUgxTotal(x)` (total) |
| Running prose where `UGX` is part of a sentence ("…1,200 UGX as opening balance for…") | `roundUgxBankers50(x).toFormat(0)` keeping prose |
| PDF receipt grand total | `formatUgxTotal(x)` |
| PDF receipt line items | `formatUgx(x)` |

---

## Task 1: Add `roundUgxFloor50` math helper

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/__tests__/format.test.ts`

- [ ] **Step 1: Replace the existing `format.test.ts` content with the new floor-helper test**

```ts
import BigNumber from "bignumber.js"
import { describe, it, expect } from "vitest"
import { roundUgxFloor50 } from "#/lib/format"

describe("roundUgxFloor50", () => {
  it("floors a positive non-multiple down to nearest 50", () => {
    expect(roundUgxFloor50("1237").toFixed(0)).toBe("1200")
    expect(roundUgxFloor50("1249").toFixed(0)).toBe("1200")
    expect(roundUgxFloor50("1299").toFixed(0)).toBe("1250")
  })
  it("leaves an exact multiple of 50 unchanged", () => {
    expect(roundUgxFloor50("1250").toFixed(0)).toBe("1250")
    expect(roundUgxFloor50("0").toFixed(0)).toBe("0")
  })
  it("returns zero for values strictly below 50", () => {
    expect(roundUgxFloor50("49").toFixed(0)).toBe("0")
    expect(roundUgxFloor50("1").toFixed(0)).toBe("0")
  })
  it("floors abs(x) for negatives, then reapplies the sign", () => {
    expect(roundUgxFloor50("-1237").toFixed(0)).toBe("-1200")
    expect(roundUgxFloor50("-1250").toFixed(0)).toBe("-1250")
    expect(roundUgxFloor50("-49").toFixed(0)).toBe("0")
  })
  it("ignores fractional shillings in input", () => {
    expect(roundUgxFloor50("1237.99").toFixed(0)).toBe("1200")
    expect(roundUgxFloor50("1250.01").toFixed(0)).toBe("1250")
  })
  it("accepts BigNumber input", () => {
    expect(roundUgxFloor50(new BigNumber("1234567")).toFixed(0)).toBe("1234550")
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/__tests__/format.test.ts`
Expected: FAIL — `roundUgxFloor50 is not a function` or similar import error.

- [ ] **Step 3: Implement `roundUgxFloor50` in `src/lib/format.ts`**

Replace the entire current contents of `src/lib/format.ts` with:

```ts
import BigNumber from "bignumber.js"

const STEP = new BigNumber(50)

/**
 * Floor a UGX amount to the nearest multiple of 50 shillings, preserving sign.
 * Rounds toward zero (so −1,237 → −1,200, not −1,250).
 */
export function roundUgxFloor50(amount: BigNumber.Value): BigNumber {
  const bn = new BigNumber(amount)
  const sign = bn.isNegative() ? -1 : 1
  return bn.abs().idiv(STEP).times(STEP).times(sign)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test src/__tests__/format.test.ts`
Expected: PASS — all `roundUgxFloor50` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/__tests__/format.test.ts
git commit -m "Add roundUgxFloor50 helper (floor to nearest 50, signed)"
```

---

## Task 2: Add `roundUgxBankers50` math helper

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/__tests__/format.test.ts`

- [ ] **Step 1: Append banker's-rounding tests to `src/__tests__/format.test.ts`**

Add to the import line:

```ts
import { roundUgxFloor50, roundUgxBankers50 } from "#/lib/format"
```

Append a new describe block at the end of the file:

```ts
describe("roundUgxBankers50", () => {
  it("rounds non-half values to the nearest multiple of 50", () => {
    expect(roundUgxBankers50("1237").toFixed(0)).toBe("1250")
    expect(roundUgxBankers50("1213").toFixed(0)).toBe("1200")
    expect(roundUgxBankers50("1276").toFixed(0)).toBe("1300")
  })
  it("breaks ties toward the even multiple (banker's)", () => {
    expect(roundUgxBankers50("1225").toFixed(0)).toBe("1200") // 24*50, even
    expect(roundUgxBankers50("1275").toFixed(0)).toBe("1300") // 26*50, even
    expect(roundUgxBankers50("1325").toFixed(0)).toBe("1300") // 26*50, even
    expect(roundUgxBankers50("1375").toFixed(0)).toBe("1400") // 28*50, even
  })
  it("leaves exact multiples of 50 unchanged", () => {
    expect(roundUgxBankers50("1250").toFixed(0)).toBe("1250")
    expect(roundUgxBankers50("0").toFixed(0)).toBe("0")
  })
  it("rounds negatives by the same rule", () => {
    expect(roundUgxBankers50("-1237").toFixed(0)).toBe("-1250")
    expect(roundUgxBankers50("-1225").toFixed(0)).toBe("-1200")
    expect(roundUgxBankers50("-1275").toFixed(0)).toBe("-1300")
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/__tests__/format.test.ts`
Expected: FAIL — `roundUgxBankers50 is not a function`.

- [ ] **Step 3: Implement `roundUgxBankers50` in `src/lib/format.ts`**

Append to `src/lib/format.ts`:

```ts
/**
 * Banker's-round a UGX amount to the nearest multiple of 50 shillings.
 * Use for sums/aggregates so the displayed total isn't biased low by
 * the per-line floor rule.
 */
export function roundUgxBankers50(amount: BigNumber.Value): BigNumber {
  return new BigNumber(amount)
    .div(STEP)
    .integerValue(BigNumber.ROUND_HALF_EVEN)
    .times(STEP)
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test src/__tests__/format.test.ts`
Expected: PASS — both describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/__tests__/format.test.ts
git commit -m "Add roundUgxBankers50 helper for unbiased aggregate rounding"
```

---

## Task 3: Replace `formatUgx` and add `formatUgxTotal`

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/__tests__/format.test.ts`

- [ ] **Step 1: Replace the legacy `formatUgx` describe block with the new expectations**

Open `src/__tests__/format.test.ts`. Replace the existing `describe("formatUgx", ...)` block (the one near the top — testing trailing `.00` and 2-decimal preservation) with:

```ts
import { roundUgxFloor50, roundUgxBankers50, formatUgx, formatUgxTotal } from "#/lib/format"

describe("formatUgx", () => {
  it("floors and formats with comma thousands and ' UGX' suffix", () => {
    expect(formatUgx("1237")).toBe("1,200 UGX")
    expect(formatUgx("1000000")).toBe("1,000,000 UGX")
  })
  it("drops fractional shillings on display", () => {
    expect(formatUgx("1237.99")).toBe("1,200 UGX")
    expect(formatUgx("1250.50")).toBe("1,250 UGX")
  })
  it("formats zero", () => {
    expect(formatUgx("0")).toBe("0 UGX")
    expect(formatUgx("49")).toBe("0 UGX")
  })
  it("formats negatives by flooring abs(x) and reapplying the sign", () => {
    expect(formatUgx("-1237")).toBe("-1,200 UGX")
    expect(formatUgx("-49")).toBe("0 UGX")
  })
})

describe("formatUgxTotal", () => {
  it("uses banker's rounding to nearest 50 with thousand separators", () => {
    expect(formatUgxTotal("1237")).toBe("1,250 UGX")
    expect(formatUgxTotal("1213")).toBe("1,200 UGX")
  })
  it("breaks halves toward the even multiple", () => {
    expect(formatUgxTotal("1225")).toBe("1,200 UGX")
    expect(formatUgxTotal("1275")).toBe("1,300 UGX")
  })
  it("formats negatives", () => {
    expect(formatUgxTotal("-1237")).toBe("-1,250 UGX")
  })
  it("formats zero", () => {
    expect(formatUgxTotal("0")).toBe("0 UGX")
  })
})
```

(Keep the `roundUgxFloor50` and `roundUgxBankers50` blocks already in the file from Tasks 1 and 2.)

- [ ] **Step 2: Run the tests and confirm formatter tests fail**

Run: `pnpm test src/__tests__/format.test.ts`
Expected: FAIL — `formatUgxTotal is not a function`, and the existing `formatUgx` returns the wrong shape (no rounding to 50).

- [ ] **Step 3: Replace the existing `formatUgx` implementation and add `formatUgxTotal`**

In `src/lib/format.ts`, replace the entire existing `formatUgx` (the one currently using `n.isInteger()` / `toFixed`) with:

```ts
function formatRounded(rounded: BigNumber): string {
  return `${rounded.toFormat(0)} UGX`
}

/**
 * Format a single UGX amount for display: floor to nearest 50, comma thousands,
 * trailing " UGX". Use for unit prices, line totals, individual amounts.
 */
export function formatUgx(amount: BigNumber.Value): string {
  return formatRounded(roundUgxFloor50(amount))
}

/**
 * Format a UGX aggregate for display: banker's-round to nearest 50, comma
 * thousands, trailing " UGX". Use for KPI cards, table-footer totals,
 * "Total"-labeled summary values.
 */
export function formatUgxTotal(amount: BigNumber.Value): string {
  return formatRounded(roundUgxBankers50(amount))
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test src/__tests__/format.test.ts`
Expected: PASS — all four describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/__tests__/format.test.ts
git commit -m "Rewrite formatUgx (floor) and add formatUgxTotal (bankers)"
```

---

## Task 4: Delete dead duplicate `formatUgx` from `currency/conversion.ts`

**Files:**
- Modify: `src/lib/currency/conversion.ts`
- Modify: `src/__tests__/currency-conversion.test.ts`

- [ ] **Step 1: Confirm the duplicate is unused in production**

Run: `grep -rn 'from "#/lib/currency/conversion"' src --include="*.ts" --include="*.tsx" | grep -v __tests__`
Expected: zero matches importing `formatUgx` from this module. (Other imports of `foreignToUgx` / `foreignToUsd` are fine.)

- [ ] **Step 2: Remove the duplicate `formatUgx` export**

Open `src/lib/currency/conversion.ts`. Delete the trailing block:

```ts
/**
 * Format UGX amount for display.
 */
export function formatUgx(amount: string | BigNumber): string {
  const bn = BigNumber.isBigNumber(amount) ? amount : new BigNumber(amount)
  return `UGX ${bn.toFormat(0)}`
}
```

- [ ] **Step 3: Remove the corresponding test block**

Open `src/__tests__/currency-conversion.test.ts`. In line 3, change:

```ts
import { foreignToUgx, foreignToUsd, formatUgx } from "../lib/currency/conversion"
```

to:

```ts
import { foreignToUgx, foreignToUsd } from "../lib/currency/conversion"
```

Then delete the entire `describe("formatUgx", ...)` block (lines 103-119 in the current file). Also delete the now-unused `BigNumber` import only if nothing else in the file references it (search the file for other `BigNumber` usages first; if any remain, keep the import).

- [ ] **Step 4: Run the test file**

Run: `pnpm test src/__tests__/currency-conversion.test.ts`
Expected: PASS — remaining `foreignToUgx` / `foreignToUsd` tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/currency/conversion.ts src/__tests__/currency-conversion.test.ts
git commit -m "Remove dead duplicate formatUgx from currency/conversion"
```

---

## Task 5: Add `roundTo` prop to `MoneyInput`

**Files:**
- Modify: `src/components/ui/money-input.tsx`
- Test: `src/__tests__/money-input.test.tsx`

- [ ] **Step 1: Create the failing component test**

Create `src/__tests__/money-input.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { MoneyInput } from "#/components/ui/money-input"

function setup(initialValue = "") {
  const onChange = vi.fn((v: string) => {
    rerender(<MoneyInput currency="UGX" roundTo={50} value={v} onChange={onChange} />)
  })
  const { rerender } = render(
    <MoneyInput currency="UGX" roundTo={50} value={initialValue} onChange={onChange} />,
  )
  const input = screen.getByRole("textbox") as HTMLInputElement
  return { input, onChange }
}

describe("MoneyInput with roundTo={50}", () => {
  it("floors a non-multiple value on blur", () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: "1237" } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith("1200")
    expect(input.value).toBe("1,200")
  })

  it("leaves an exact multiple unchanged on blur", () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: "1250" } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith("1250")
    expect(input.value).toBe("1,250")
  })

  it("does not modify an empty input on blur", () => {
    const { input, onChange } = setup()
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe("")
  })

  it("floors abs() and reapplies sign for negative values", () => {
    const { input, onChange } = setup()
    fireEvent.change(input, { target: { value: "-1237" } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith("-1200")
    expect(input.value).toBe("-1,200")
  })
})
```

(`MoneyInput` currently strips non-digit characters except `.` and `,`. Negative entry currently is filtered out — the negative test will surface this. If the input strips `-`, update the regex in `handleChange` to allow a leading `-`: `/[^0-9.,-]/g` and ensure `-` only appears at position 0.)

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/__tests__/money-input.test.tsx`
Expected: FAIL — `roundTo` prop is not recognized; blur does not floor; negative values are stripped.

- [ ] **Step 3: Add `roundTo` to `MoneyInputProps` and update `handleBlur` and `handleChange`**

Open `src/components/ui/money-input.tsx`.

In the `MoneyInputProps` interface (after `error?: string`) add:

```ts
  /** If set, on blur the value is floored to a multiple of this step (e.g. 50 for UGX). */
  roundTo?: number
```

Add `roundTo` to the destructured props in the function signature:

```ts
function MoneyInput({
  className,
  currency,
  value,
  onChange,
  decimals = 0,
  error,
  roundTo,
  ...props
}: MoneyInputProps) {
```

Update the regex in `handleChange` to allow a leading minus sign. Replace:

```ts
const raw = e.target.value.replace(/[^0-9.,]/g, "")
```

with:

```ts
const raw = e.target.value.replace(/[^0-9.,-]/g, "")
```

Then immediately after `const stripped = stripCommas(raw)` add:

```ts
// Allow a single leading minus, drop any other minus signs.
const sign = stripped.startsWith("-") ? "-" : ""
const digits = stripped.replace(/-/g, "")
const normalized = sign + digits
```

…and use `normalized` in place of `stripped` for the rest of the function (the empty check, decimal validation, and `onChange` call). Specifically:

```ts
if (normalized === "" || normalized === "-") {
  setDisplay(normalized)
  onChange(normalized === "-" ? "" : normalized)
  return
}

if (decimals === 0 && normalized.includes(".")) return
const parts = normalized.split(".")
if (parts.length > 2) return
if (parts[1] && parts[1].length > decimals) return

if (normalized !== "." && normalized !== "-" && isNaN(Number(normalized))) return

setDisplay(formatWithCommas(normalized))
onChange(normalized)
```

(Note: `formatWithCommas` already preserves the leading `-` because the regex only acts on `\B(?=(\d{3})+(?!\d))`. Verify with a sanity check.)

Replace the existing `handleBlur` body with:

```ts
function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
  // Clean up trailing dots
  let raw = display.endsWith(".") ? display.slice(0, -1) : display
  let stripped = stripCommas(raw)

  if (roundTo && stripped !== "" && stripped !== "-") {
    const bn = new BigNumber(stripped)
    if (!bn.isNaN()) {
      const sign = bn.isNegative() ? -1 : 1
      const step = new BigNumber(roundTo)
      const floored = bn.abs().idiv(step).times(step).times(sign)
      stripped = floored.toFixed(0)
    }
  }

  if (stripped !== stripCommas(display)) {
    setDisplay(formatWithCommas(stripped))
    onChange(stripped)
  }
  props.onBlur?.(e)
}
```

Add the BigNumber import at the top of the file:

```ts
import BigNumber from "bignumber.js"
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test src/__tests__/money-input.test.tsx`
Expected: PASS — all four cases green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — entire suite green.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/money-input.tsx src/__tests__/money-input.test.tsx
git commit -m "MoneyInput: add roundTo prop; floor value on blur"
```

---

## Task 6: Wire `roundTo={50}` on every UGX `MoneyInput` callsite

**Files:**
- Modify: `src/components/opening-balance/opening-balance-form.tsx:294-296`
- Modify: `src/routes/shop/index.tsx:517-523`
- Modify: `src/routes/supply/$routeId.tsx:680-682`
- Modify: `src/routes/store/transfers.tsx:345-349`

- [ ] **Step 1: Add `roundTo={50}` to `opening-balance-form.tsx`**

In `src/components/opening-balance/opening-balance-form.tsx` change:

```tsx
<MoneyInput
  currency="UGX"
```

(the only `currency="UGX"` MoneyInput in this file, around line 294) to:

```tsx
<MoneyInput
  currency="UGX"
  roundTo={50}
```

- [ ] **Step 2: Add `roundTo={50}` in `routes/shop/index.tsx`**

Locate the `<MoneyInput currency="UGX" ...>` near line 517 (sale-price entry). Add `roundTo={50}` immediately after the `currency` prop.

- [ ] **Step 3: Add `roundTo={50}` in `routes/supply/$routeId.tsx`**

Locate the `<MoneyInput ... currency="UGX" />` near line 680 (item-price entry, only rendered when `currency === "UGX"`). Add `roundTo={50}` to the same element.

- [ ] **Step 4: Add `roundTo={50}` in `routes/store/transfers.tsx`**

Locate the `<MoneyInput ... currency="UGX" ...>` near line 347 (Shop Min Sell Price entry). Add `roundTo={50}`.

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/opening-balance/opening-balance-form.tsx src/routes/shop/index.tsx src/routes/supply/\$routeId.tsx src/routes/store/transfers.tsx
git commit -m "MoneyInput: floor UGX entries to nearest 50 on blur"
```

---

## Task 7: Migrate `routes/shop/index.tsx` display sites

**Files:**
- Modify: `src/routes/shop/index.tsx`

- [ ] **Step 1: Add the helper imports**

At the top of the file, alongside the existing `BigNumber` import, add:

```ts
import {
  roundUgxFloor50,
  roundUgxBankers50,
  formatUgx,
  formatUgxTotal,
} from "#/lib/format"
```

- [ ] **Step 2: Migrate the Stock Value KPI card (~line 263-265)**

Replace:

```tsx
<div className="text-2xl font-bold font-mono">
  {totalValue.toFormat(0)}
</div>
<p className="text-xs text-muted-foreground">UGX</p>
```

with:

```tsx
<div className="text-2xl font-bold font-mono">
  {formatUgxTotal(totalValue)}
</div>
```

(Drop the redundant `<p>UGX</p>` — the formatter now supplies the suffix.)

- [ ] **Step 3: Migrate the stock-table cells (~line 311 and 314)**

Replace:

```tsx
{new BigNumber(s.costPerUnitUgx).toFormat(0)}
```

with:

```tsx
{roundUgxFloor50(s.costPerUnitUgx).toFormat(0)}
```

…and same for `s.minimumSellPriceUgx` on line 314. (Cells stay suffix-less because the column header carries the UGX label; spec rule "cell + (UGX) header" applies.)

- [ ] **Step 4: Migrate the inline min-price hint (~line 514-516)**

Replace:

```tsx
Price (min:{" "}
{new BigNumber(s.minimumSellPriceUgx).toFormat(0)})
```

with:

```tsx
Price (min: {formatUgx(s.minimumSellPriceUgx)})
```

- [ ] **Step 5: Migrate the inline error string (~line 524-528)**

Replace:

```tsx
error={
  isBelowMin
    ? `Below minimum (${new BigNumber(s.minimumSellPriceUgx).toFormat(0)})`
    : undefined
}
```

with:

```tsx
error={
  isBelowMin
    ? `Below minimum (${formatUgx(s.minimumSellPriceUgx)})`
    : undefined
}
```

- [ ] **Step 6: Migrate the cart total (~line 580-583)**

Replace:

```tsx
<p className="text-xl font-bold font-mono">
  UGX {total.toFormat(0)}
</p>
```

with:

```tsx
<p className="text-xl font-bold font-mono">
  {formatUgxTotal(total)}
</p>
```

- [ ] **Step 7: Confirm no `BigNumber(...).toFormat(0)` remains in the file**

Run: `grep -n 'toFormat(0)' src/routes/shop/index.tsx`
Expected: zero matches.

- [ ] **Step 8: Run tests and typecheck**

Run: `pnpm test && pnpm lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/routes/shop/index.tsx
git commit -m "shop/index: round UGX displays to nearest 50"
```

---

## Task 8: Migrate `routes/shop/sales.tsx`

**Files:**
- Modify: `src/routes/shop/sales.tsx`

- [ ] **Step 1: Add the helper imports**

```ts
import { roundUgxFloor50, formatUgxTotal } from "#/lib/format"
```

- [ ] **Step 2: Migrate the Total Revenue header (~line 109)**

Replace:

```tsx
UGX {totalRevenue.toFormat(0)}
```

with:

```tsx
{formatUgxTotal(totalRevenue)}
```

- [ ] **Step 3: Migrate the per-row Amount cell (~line 147)**

Replace:

```tsx
{new BigNumber(sale.totalAmount).toFormat(0)}
```

with:

```tsx
{roundUgxFloor50(sale.totalAmount).toFormat(0)}
```

(Column header reads "Amount (UGX)" — keep cell suffix-less.)

- [ ] **Step 4: Confirm clean and commit**

Run: `grep -n 'toFormat(0)' src/routes/shop/sales.tsx` → zero matches.
Run: `pnpm test`

```bash
git add src/routes/shop/sales.tsx
git commit -m "shop/sales: round UGX displays to nearest 50"
```

---

## Task 9: Migrate `routes/store/index.tsx`

**Files:**
- Modify: `src/routes/store/index.tsx`

- [ ] **Step 1: Add the helper imports**

```ts
import { roundUgxFloor50, roundUgxBankers50, formatUgxTotal } from "#/lib/format"
```

- [ ] **Step 2: Migrate the store-value KPI card (~line 93-95)**

Replace:

```tsx
{totalValue.toFormat(0)}
</div>
<p className="text-xs text-muted-foreground">UGX (at cost)</p>
```

with:

```tsx
{formatUgxTotal(totalValue)}
</div>
<p className="text-xs text-muted-foreground">at cost</p>
```

(Keep the "at cost" qualifier; UGX moves into the formatted value.)

- [ ] **Step 3: Migrate stock-table per-row cells (~line 190 and 214)**

Replace `new BigNumber(item.costPerUnitUgx).toFormat(0)` and `new BigNumber(item.minimumSellPriceUgx).toFormat(0)` with `roundUgxFloor50(item.costPerUnitUgx).toFormat(0)` and `roundUgxFloor50(item.minimumSellPriceUgx).toFormat(0)`. (Column headers say `(UGX)` — cells stay suffix-less.)

- [ ] **Step 4: Migrate the per-row totalValue cell (~line 219)**

Replace:

```tsx
{totalValue.toFormat(0)}
```

with:

```tsx
{roundUgxBankers50(totalValue).toFormat(0)}
```

(This one is a per-row aggregate `qty × cost`; banker's rounding fits the spec rule for sums.)

- [ ] **Step 5: Verify and commit**

Run: `grep -n 'toFormat(0)' src/routes/store/index.tsx` → zero matches.
Run: `pnpm test`

```bash
git add src/routes/store/index.tsx
git commit -m "store/index: round UGX displays to nearest 50"
```

---

## Task 10: Migrate `routes/store/transfers.tsx`

**Files:**
- Modify: `src/routes/store/transfers.tsx`

- [ ] **Step 1: Add the helper imports**

```ts
import { roundUgxFloor50, roundUgxBankers50, formatUgx } from "#/lib/format"
```

- [ ] **Step 2: Migrate the transfer-row total cell (~line 173)**

Replace:

```tsx
{total.toFormat(0)}
```

with:

```tsx
{roundUgxBankers50(total).toFormat(0)}
```

(Header reads "Total (UGX)"; suffix-less; banker's because it is a per-row aggregate.)

- [ ] **Step 3: Migrate the inline cost-per-unit display (~line 322)**

Replace:

```tsx
{new BigNumber(s.costPerUnitUgx).toFormat(0)} UGX
```

with:

```tsx
{formatUgx(s.costPerUnitUgx)}
```

(Drop the inline " UGX" — the formatter now supplies it.)

- [ ] **Step 4: Verify and commit**

Run: `grep -n 'toFormat(0)' src/routes/store/transfers.tsx` → zero matches.
Run: `pnpm test`

```bash
git add src/routes/store/transfers.tsx
git commit -m "store/transfers: round UGX displays to nearest 50"
```

---

## Task 11: Migrate `routes/supply/index.tsx` and `routes/supply/$routeId.tsx`

**Files:**
- Modify: `src/routes/supply/index.tsx`
- Modify: `src/routes/supply/$routeId.tsx`

- [ ] **Step 1: `supply/index.tsx` — add imports**

```ts
import { roundUgxBankers50 } from "#/lib/format"
```

- [ ] **Step 2: `supply/index.tsx` — migrate route-row totals (~line 139, 142)**

Replace `{totalCost.toFormat(0)}` and `{totalExpenses.toFormat(0)}` with `{roundUgxBankers50(totalCost).toFormat(0)}` and `{roundUgxBankers50(totalExpenses).toFormat(0)}`. Both columns have `(UGX)` headers; both are sums.

- [ ] **Step 3: `supply/$routeId.tsx` — add imports**

```ts
import { roundUgxFloor50, roundUgxBankers50, formatUgxTotal } from "#/lib/format"
```

- [ ] **Step 4: `supply/$routeId.tsx` — migrate the three KPI cards (~lines 168, 184, 200-202)**

Replace `{totalItemCost.toFormat(0)}`, `{totalExpenses.toFormat(0)}`, and `{grandTotal.toFormat(0)}` with `{formatUgxTotal(totalItemCost)}`, `{formatUgxTotal(totalExpenses)}`, `{formatUgxTotal(grandTotal)}`.

For the grandTotal card, also remove the sibling label:

```tsx
{formatUgxTotal(grandTotal)}
</div>
<p className="text-xs text-muted-foreground">UGX</p>
```

becomes:

```tsx
{formatUgxTotal(grandTotal)}
</div>
```

(Same treatment for `totalItemCost` / `totalExpenses` cards if they have a sibling `<p>UGX</p>` — verify by reading the surrounding 5 lines around each card and remove only the redundant sibling.)

- [ ] **Step 5: `supply/$routeId.tsx` — migrate the items table per-row cell (~line 300)**

Replace:

```tsx
{new BigNumber(item.totalCostUgx).toFormat(0)}
```

with:

```tsx
{roundUgxBankers50(item.totalCostUgx).toFormat(0)}
```

(Column header reads "Total (UGX)" — it is a per-row aggregate of qty × unit cost; banker's rule.)

- [ ] **Step 6: `supply/$routeId.tsx` — migrate the expenses table per-row cell (~line 374)**

Replace:

```tsx
{new BigNumber(exp.amount).toFormat(0)}
```

with:

```tsx
{roundUgxFloor50(exp.amount).toFormat(0)}
```

(Single expense entry — line item rule, floor. `.toFormat(0)` preserves comma separators; do not use `.toFixed(0)` here.)

- [ ] **Step 7: Verify and commit**

Run: `grep -n 'toFormat(0)' src/routes/supply/index.tsx src/routes/supply/\$routeId.tsx` → zero matches.
Run: `pnpm test`

```bash
git add src/routes/supply/index.tsx src/routes/supply/\$routeId.tsx
git commit -m "supply: round UGX displays to nearest 50"
```

---

## Task 12: Migrate `routes/reports/index.tsx` and `routes/reports/ledger.tsx`

**Files:**
- Modify: `src/routes/reports/index.tsx`
- Modify: `src/routes/reports/ledger.tsx`

- [ ] **Step 1: `reports/index.tsx` — add imports**

```ts
import { roundUgxFloor50, roundUgxBankers50, formatUgxTotal } from "#/lib/format"
```

- [ ] **Step 2: `reports/index.tsx` — migrate KPI/total fields**

Map each callsite:

| Line | Replace | With |
|---|---|---|
| 48 | `new BigNumber(cash.cashBalance).toFormat(0)` | `roundUgxBankers50(cash.cashBalance).toFormat(0)` |
| 61 | `new BigNumber(cash.bankBalance).toFormat(0)` | `roundUgxBankers50(cash.bankBalance).toFormat(0)` |
| 74 | `new BigNumber(cash.totalBalance).toFormat(0)` | `roundUgxBankers50(cash.totalBalance).toFormat(0)` |
| 97 | `new BigNumber(r.amount).toFormat(0)` | `roundUgxFloor50(r.amount).toFormat(0)` |
| 104 | `new BigNumber(pnl.totalRevenue).toFormat(0)` | `roundUgxBankers50(pnl.totalRevenue).toFormat(0)` |
| 122 | `new BigNumber(e.amount).toFormat(0)` | `roundUgxFloor50(e.amount).toFormat(0)` |
| 129 | `new BigNumber(pnl.totalExpenses).toFormat(0)` | `roundUgxBankers50(pnl.totalExpenses).toFormat(0)` |
| 148 | `UGX {new BigNumber(pnl.netIncome).toFormat(0)}` | `{formatUgxTotal(pnl.netIncome)}` |
| 172 | `new BigNumber(a.balance).toFormat(0)` | `roundUgxFloor50(a.balance).toFormat(0)` |
| 179 | `new BigNumber(bs.totalAssets).toFormat(0)` | `roundUgxBankers50(bs.totalAssets).toFormat(0)` |
| 197 | `new BigNumber(l.balance).toFormat(0)` | `roundUgxFloor50(l.balance).toFormat(0)` |
| 204 | `new BigNumber(bs.totalLiabilities).toFormat(0)` | `roundUgxBankers50(bs.totalLiabilities).toFormat(0)` |
| 222 | `new BigNumber(e.balance).toFormat(0)` | `roundUgxFloor50(e.balance).toFormat(0)` |
| 229 | `new BigNumber(bs.totalEquity).toFormat(0)` | `roundUgxBankers50(bs.totalEquity).toFormat(0)` |

(Lines whose surrounding label says "Total" / "Net" / "Balance" use banker's; line items use floor. The line-148 net income removes the inline `UGX ` prefix — `formatUgxTotal` provides it.)

- [ ] **Step 3: `reports/ledger.tsx` — migrate the per-entry amount cell (~line 72)**

Add import:

```ts
import { roundUgxFloor50 } from "#/lib/format"
```

Replace:

```tsx
{new BigNumber(e.amount).toFormat(0)}
```

with:

```tsx
{roundUgxFloor50(e.amount).toFormat(0)}
```

- [ ] **Step 4: Verify and commit**

Run: `grep -n 'toFormat(0)' src/routes/reports/index.tsx src/routes/reports/ledger.tsx` → zero matches.
Run: `pnpm test`

```bash
git add src/routes/reports/index.tsx src/routes/reports/ledger.tsx
git commit -m "reports: round UGX displays to nearest 50"
```

---

## Task 13: Migrate `components/opening-balance/opening-balance-form.tsx`

**Files:**
- Modify: `src/components/opening-balance/opening-balance-form.tsx`

- [ ] **Step 1: Add imports**

```ts
import { roundUgxBankers50 } from "#/lib/format"
```

(No `formatUgx*` needed here — every UGX site has surrounding prose or a labeled column.)

- [ ] **Step 2: Migrate the running-prose total (~line 209-211)**

Replace:

```tsx
{new BigNumber(summary.totalValueUgx).toFormat(0)}
</div>
UGX as opening balance for{" "}
```

with:

```tsx
{roundUgxBankers50(summary.totalValueUgx).toFormat(0)}
</div>
UGX as opening balance for{" "}
```

(Keep " UGX" prose; just round the number.)

- [ ] **Step 3: Migrate the per-row line total (~line 302)**

Replace:

```tsx
{lineTotal ? lineTotal.toFormat(0) : "-"}
```

with:

```tsx
{lineTotal ? roundUgxBankers50(lineTotal).toFormat(0) : "-"}
```

(Per-row `qty × cost` aggregate — banker's. Column header uses "(UGX)".)

- [ ] **Step 4: Migrate the footer total (~line 331-333)**

Replace:

```tsx
{total.toFormat(0)}
</div>
UGX
```

with:

```tsx
{roundUgxBankers50(total).toFormat(0)}
</div>
UGX
```

- [ ] **Step 5: Migrate the second footer total (~line 355-357)**

Replace:

```tsx
{total.toFormat(0)}
</div>
UGX to{" "}
```

with:

```tsx
{roundUgxBankers50(total).toFormat(0)}
</div>
UGX to{" "}
```

- [ ] **Step 6: Verify and commit**

Run: `grep -n 'toFormat(0)' src/components/opening-balance/opening-balance-form.tsx` → zero matches.
Run: `pnpm test`

```bash
git add src/components/opening-balance/opening-balance-form.tsx
git commit -m "opening-balance: round UGX displays to nearest 50"
```

---

## Task 14: Update PDF receipt grand total

**Files:**
- Modify: `src/lib/pdf/receipt-html.ts`

- [ ] **Step 1: Update the import**

In `src/lib/pdf/receipt-html.ts` line 1:

```ts
import { formatUgx, formatUgxTotal } from "#/lib/format"
```

- [ ] **Step 2: Use `formatUgxTotal` for the grand total (~line 83)**

Replace:

```ts
<div class="total">Total: ${formatUgx(sale.totalAmount)}</div>
```

with:

```ts
<div class="total">Total: ${formatUgxTotal(sale.totalAmount)}</div>
```

(Line items continue to use `formatUgx` — they are per-line, line-item rule.)

- [ ] **Step 3: Verify and commit**

Run: `pnpm test`

```bash
git add src/lib/pdf/receipt-html.ts
git commit -m "PDF receipt: banker's-round grand total to nearest 50"
```

---

## Task 15: Final audit and smoke test

- [ ] **Step 1: Confirm no stragglers in production code**

Run:

```bash
grep -rn '\.toFormat(0)' src/routes src/components src/lib | grep -v __tests__
```

Expected: zero matches.

If any match remains, classify it (line item vs total) and migrate following the helper-choice rule before continuing.

- [ ] **Step 2: Confirm every UGX `MoneyInput` uses `roundTo={50}`**

Run:

```bash
grep -rn 'currency="UGX"' src/routes src/components | grep -v __tests__
```

For each match, read the surrounding 8 lines and verify `roundTo={50}` is present. If any is missing, add it and re-grep.

- [ ] **Step 3: Confirm the dead duplicate is gone**

Run:

```bash
grep -n 'formatUgx' src/lib/currency/conversion.ts
```

Expected: zero matches.

- [ ] **Step 4: Run full unit test suite**

Run: `pnpm test`
Expected: every test green.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 6: Manual smoke test in dev**

Run: `pnpm dev` (in a separate terminal)

Walk through these flows and visually confirm each value renders as a multiple of 50 (and lacks duplicate "UGX UGX"):

1. **Shop page** — Stock-Value KPI card; cost/min-sell columns; cart total after adding an item with a non-multiple price; the inline "min: …" hint and "Below minimum (…)" error.
2. **Shop sales page** — "Total Revenue" header; per-sale Amount column.
3. **Store page** — Store-value KPI; per-row cost-per-unit, min-sell, and total-value columns.
4. **Store transfers page** — Total column on transfer list; cost-per-unit display when starting a transfer; Shop-Min-Sell-Price input flooring on blur.
5. **Supply routes list** — Total Cost (UGX) and Expenses (UGX) columns.
6. **Supply route detail** — Three KPI cards (item cost, expenses, grand total); items-table Total (UGX) column; expenses-table Amount (UGX) column.
7. **Reports page** — Cash, bank, total balance KPIs; revenue/expenses lists and totals; net income; balance-sheet sections.
8. **Reports ledger page** — Amount column.
9. **Opening balance form** — Type "1237" into a UGX cost-per-unit field, blur, confirm value is "1,200"; line totals and grand total round.
10. **Sale receipt PDF** — Trigger the print-receipt flow on a recent sale; line items and Total: render correctly.

- [ ] **Step 7: Commit any straggler fixes (if any) or close out**

If steps 1-3 surfaced fixes, commit:

```bash
git commit -m "Fix UGX rounding stragglers found in audit"
```

Otherwise, the work is done. The plan-tracking branch can be merged.

---

## Self-review notes

- **Spec coverage:** Tasks 1-3 build the helper API in `src/lib/format.ts`. Task 4 deletes the duplicate. Task 5 implements the `MoneyInput` blur-floor behavior. Task 6 wires it on every UGX entry site. Tasks 7-13 cover every display callsite enumerated in the spec. Task 14 covers the PDF receipt grand total. Task 15 audits and smoke-tests. Acceptance criteria from the spec map: ✅ no `currency/conversion` `formatUgx` import → step 4 + step 15.3; ✅ no `BigNumber.toFormat(0)` on UGX in routes/components → step 15.1; ✅ every UGX `MoneyInput` has `roundTo={50}` → step 15.2; ✅ PDF line items use `formatUgx`, total uses `formatUgxTotal` → task 14; ✅ format/money-input tests pass → tasks 1-3, 5; ✅ existing tests untouched → confirmed by `pnpm test` after each task.
- **Banker's vs floor decisions** are encoded in the per-line replacement table for `routes/reports/index.tsx` and the same pattern repeats in earlier tasks. Per-row computed totals (qty × price, sum of children) use banker's; raw individual amounts use floor.
- **Type consistency:** All four helpers accept `BigNumber.Value` (a union including `string`, `number`, `BigNumber`). Math helpers return `BigNumber`; formatters return `string`. `MoneyInput`'s `roundTo` is `number`. No mismatched signatures across tasks.
- **Out of scope reminder:** No DB migration; no server-function changes; no journal-entry rounding. Server side stays at cent precision and `.toFixed(2)` persistence — verify by checking `pnpm test` is green after each migration task without modifying any file in `src/server/` or `src/db/`.
