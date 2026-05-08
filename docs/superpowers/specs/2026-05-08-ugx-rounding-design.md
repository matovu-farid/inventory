# UGX Display Rounding to Nearest 50 Shillings

**Date:** 2026-05-08
**Status:** Approved
**Owner:** Inventory team

## Goal

Every UGX amount shown to a user — on screen, in PDF receipts, in notifications — is presented as a multiple of 50 shillings. Single values floor down (toward zero); aggregate totals on summary cards / KPI tiles / footer rows use banker's rounding to nearest 50 to avoid systematic low bias.

## Why

There are no UGX denominations below 50 shillings in circulation. Showing values like "1,237 UGX" or "1,000.50 UGX" implies a price the customer cannot pay. Single-value floor (never up) ensures we never quote a price the customer cannot meet exactly. For totals derived from many already-rounded items, always-floor would compound the bias and the displayed total could drift meaningfully below the actual value, so we use banker's rounding for those.

## Non-goals

- Changing DB schema (`numeric(15, 2)` columns stay)
- Changing server-side calculations, FX conversion, or `.toFixed(2)` persistence
- Changing journal entries, ledger amounts, or accounting totals at storage time
- Rounding non-UGX currencies (USD, RMB, etc.)
- Adding migrations or rewriting historical stored values
- Changing customer credit balance precision

## Design

### Helpers — `src/lib/format.ts`

Replace the existing `formatUgx` and add four exports. Pure math helpers are separate from formatters so they can be reused (e.g. by `MoneyInput`).

```ts
import BigNumber from "bignumber.js"

// Math
export function roundUgxFloor50(amount: BigNumber.Value): BigNumber
export function roundUgxBankers50(amount: BigNumber.Value): BigNumber

// Formatting
export function formatUgx(amount: BigNumber.Value): string         // floor
export function formatUgxTotal(amount: BigNumber.Value): string    // bankers
```

**`roundUgxFloor50`** — floors `abs(x)` to a multiple of 50, then reapplies the sign:

```
sign(x) * floor(abs(x) / 50) * 50
```

Examples: `1237 → 1200`, `1250 → 1250`, `0 → 0`, `-1237 → -1200`, `-1250 → -1250`, `49 → 0`, `-49 → 0`.

**`roundUgxBankers50`** — `BigNumber` rounding mode `ROUND_HALF_EVEN` against a step of 50: `bn.div(50).integerValue(ROUND_HALF_EVEN).times(50)`.

Examples: `1225 → 1200` (half goes to even 24×50), `1275 → 1300` (half goes to even 26×50), `1237 → 1250` (closer to 1250 than 1200), `1213 → 1200`, exact multiples of 50 stay (`1250 → 1250`).

**`formatUgx` / `formatUgxTotal`** — apply the corresponding rounding, then format with comma thousands separators and a trailing `" UGX"`. Output is always integer (no decimals) since storage cents are dropped on display.

Examples: `formatUgx("1237.50") === "1,200 UGX"`, `formatUgxTotal("1225") === "1,200 UGX"`.

### Display-site migration

Today there are ~47 callsites in `src/routes` and `src/components` that render UGX directly via `BigNumber.toFormat(0)`. Replace each one with `formatUgx` or `formatUgxTotal` per the rule:

- **`formatUgxTotal`** — values labeled "Total", "Net", "Balance", or sitting in a KPI / summary card / table footer. Concretely:
  - `routes/shop/index.tsx`: total inventory value KPI; cart total
  - `routes/shop/sales.tsx`: "Total Revenue" header
  - `routes/store/index.tsx`: total store value KPI
  - `routes/store/transfers.tsx`: transfer grand total per row footer
  - `routes/supply/index.tsx`: route table totalCost / totalExpenses footer aggregations
  - `routes/supply/$routeId.tsx`: totalItemCost, totalExpenses, grandTotal cards
  - `routes/reports/index.tsx`: cashBalance, bankBalance, totalBalance, totalRevenue, totalExpenses, netIncome, totalAssets, totalLiabilities, totalEquity
  - `components/opening-balance/opening-balance-form.tsx`: `summary.totalValueUgx`, footer `total`
- **`formatUgx`** — every per-row / per-item / unit value:
  - per-row `costPerUnitUgx`, `minimumSellPriceUgx`, `unitPriceUgx`, `totalPriceUgx` line values
  - per-row `amount` in the ledger and reports tables
  - inline price chips (e.g., `"Below minimum (X)"` text in `routes/shop/index.tsx`)
  - per-line `lineTotal` in opening-balance form
  - PDF receipt rows and grand total in `src/lib/pdf/receipt-html.ts` (the receipt grand total uses `formatUgxTotal`; line items use `formatUgx`)

Decision rule for ambiguous cases: if removing the value from the table would change the on-screen "Total" label below it, the value is a line item (use `formatUgx`); the label itself is the total (use `formatUgxTotal`).

### `MoneyInput` UGX behavior — `src/components/ui/money-input.tsx`

Add an opt-in prop:

```ts
interface MoneyInputProps {
  // ...existing props
  /** If set, on blur the value is floored to a multiple of this step. */
  roundTo?: number
}
```

In the existing `handleBlur`, after the trailing-dot cleanup, when `roundTo` is set and the stripped numeric string is non-empty:

```
const floored = sign(x) * floor(abs(x) / roundTo) * roundTo
```

Update both internal display state and call `onChange(floored)`. Empty / partial inputs pass through unchanged. Typing remains free.

Set `roundTo={50}` at every existing UGX `MoneyInput` site:

- `components/opening-balance/opening-balance-form.tsx` (`currency="UGX"` row)
- `routes/shop/index.tsx` (sale price entry)
- `routes/supply/$routeId.tsx` (UGX-currency item entry, line ~681)
- `routes/store/transfers.tsx` (shop min sell price)

`RateInput` (exchange rates) is unchanged.

### Dead code cleanup

`src/lib/currency/conversion.ts` exports a separate `formatUgx` that is never imported in production code (only its own test file imports it). Delete that export and remove the corresponding describe block in `src/__tests__/currency-conversion.test.ts`. The `foreignToUgx` and `foreignToUsd` exports stay.

## Tests

`src/__tests__/format.test.ts` is rewritten:

- `roundUgxFloor50`: positive non-multiple, negative non-multiple, exact multiple, zero, value under 50 (rounds to 0), large value, BigNumber input, decimal input (`"1237.99"` → `1200`).
- `roundUgxBankers50`: half-down to even (1225 → 1200), half-up to even (1275 → 1300), exact multiples stay (1250 → 1250), non-half values round to nearest (1237 → 1250, 1213 → 1200), negatives.
- `formatUgx`: integer output with comma separators; "1,200 UGX"; negatives; zero.
- `formatUgxTotal`: same format, banker's rounding behavior preserved through formatting.

`src/__tests__/money-input.test.tsx` (new): renders `MoneyInput` with `currency="UGX" roundTo={50}`, types "1237", blurs, asserts the displayed value is "1,200" and that `onChange` was called with `"1200"`. Covers empty-input no-op and an already-rounded value no-op.

The `formatUgx` describe block in `src/__tests__/currency-conversion.test.ts` is removed.

Existing accounting tests are unaffected — they assert stored values (cent-precision), which we are not changing.

## Acceptance criteria

- [ ] No production code imports the deleted `formatUgx` from `src/lib/currency/conversion.ts`.
- [ ] No production-code call to `BigNumber.toFormat(0)` on a UGX value remains in `src/routes` or `src/components` (greppable).
- [ ] Every UGX `MoneyInput` (currency="UGX") sets `roundTo={50}`.
- [ ] PDF receipts render line items via `formatUgx` and the grand total via `formatUgxTotal`.
- [ ] All tests in `src/__tests__/format.test.ts` and `src/__tests__/money-input.test.tsx` pass.
- [ ] Existing accounting/ledger/sales/transfer tests still pass without modification.
