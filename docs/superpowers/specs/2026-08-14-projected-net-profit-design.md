# Projected net profit for supply-route financial summaries

## Context

The supply-route review already shows item cost, route expenses, total cost, selling value, and a profit figure. The current aggregate `grossProfitUgx` subtracts route expenses because it is calculated from selling value minus total cost. That makes the label “Projected gross profit” financially misleading and prevents the UI from showing the separate net-profit result.

## Goals

- Define gross profit as total selling value minus item cost.
- Define projected net profit as gross profit minus valid, converted route expenses.
- Show both values in the route financial summary.
- Preserve the existing total-cost, expense breakdown, line-level gross-profit, and item-group gross-profit behavior.
- Keep invalid or unconvertible foreign expenses excluded from normalized expense totals and reported through the existing warning.

## Non-goals

- Changing how item costs, selling values, currencies, or expense conversions are calculated.
- Adding accounting-period, tax, inventory-adjustment, or realized-sales logic.
- Changing the meaning of `totalCostUgx`: it remains item cost plus normalized route expenses.

## Design

`buildSupplyRouteReview` remains the single source of truth for route-review financial totals. After computing `itemCostUgx`, `expenseTotalUgx`, and `totalSellingValueUgx`, it will expose:

- `grossProfitUgx = totalSellingValueUgx - itemCostUgx`
- `netProfitUgx = grossProfitUgx - expenseTotalUgx`

The existing per-line and per-item-group `grossProfitUgx` values already use selling value minus landed item cost, so their semantics remain unchanged. The aggregate gross-profit field is brought into alignment with those values. `totalCostUgx` continues to be `itemCostUgx + expenseTotalUgx` for cost reporting.

The summary card will keep the existing gross-profit stat, now backed by the corrected aggregate value, and add a “Projected net profit at minimum sell price” stat backed by `netProfitUgx`. Both stats will use the same positive/negative styling; the tone will be based on the corresponding value so a loss is shown as destructive.

## Data flow and edge cases

1. Route lines are normalized and aggregated into item cost and selling value.
2. Expenses are converted to UGX using the existing conversion helper.
3. Valid converted expenses are aggregated by category and into `expenseTotalUgx`.
4. Invalid or missing foreign conversions remain excluded and increment `missingExpenseConversions`.
5. Gross profit excludes route expenses; projected net profit includes them.

With no valid expenses, gross and projected net profit are equal. If expenses exceed gross profit, projected net profit is negative while gross profit can remain positive. If item cost exceeds selling value, both values can be negative, with net profit no greater than gross profit.

## Testing

Extend the existing `buildSupplyRouteReview` tests to verify:

- gross profit excludes route expenses and net profit subtracts them;
- gross and net profit are equal when there are no valid expenses;
- negative values are preserved for both calculations; and
- existing total-cost and invalid-expense behavior remains intact.

Add or update the route-review component test to verify that both summary labels render and display their respective formatted values.

## Scope of implementation

Expected production changes are limited to `src/lib/supply-route-review.ts` and `src/components/supply/supply-route-review.tsx`, with focused updates to the existing route-review unit/component tests. No database migration or API contract change is required because this is a derived presentation calculation.
