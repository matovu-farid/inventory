# Money Input Standardization

## Context

Monetary fields do not currently share one input experience. Some screens use
the existing comma-formatting `MoneyInput`, while the guided supply-route
basics still use plain inputs and exchange rates use a separate `RateInput`.
This makes large values harder to read and means users encounter different
editing behavior across the application.

## Decision

Use one shared `MoneyInput` component for every user-editable monetary value,
including exchange rates. Generalize the component as needed and remove the
separate `RateInput` usage.

The component will display grouping separators while the user types, but will
continue to call `onChange` with an unformatted numeric string. This keeps the
existing server and database contract unchanged.

## Precision rules

- UGX: whole numbers only; no decimal places. Existing UGX rounding rules,
  such as rounding down to a multiple of 50 where applicable, remain explicit
  per field.
- USD: decimals allowed where the field supports them.
- RMB: decimals allowed where the field supports them.
- Exchange rates: use `MoneyInput` with field-specific precision. UGX-based
  rates are whole numbers; RMB/USD-based rates retain their existing decimal
  precision unless a field explicitly requires a different value.

The component remains configurable through props such as currency/prefix,
decimal precision, and optional rounding. Formatting is presentation-only;
commas must never be submitted or persisted as part of the numeric value.

## Scope

Apply the shared input to monetary fields across:

- supply-route budgets and exchange rates;
- supply-route item costs and currency conversion rates;
- item cost and minimum selling-price forms;
- expenses;
- shop and POS selling prices;
- opening balances and other money-entry forms already using `MoneyInput`.

Quantity, count, and stock-threshold inputs are not monetary and should remain
ordinary numeric inputs. Existing read-only money formatting is outside this
change unless required to verify consistency.

## UX behavior

- Values show thousands separators immediately while editing (for example,
  `200000` displays as `200,000`).
- Decimal values retain the decimal portion while editing (for example,
  `7.25` displays as `7.25`; `1234567.5` displays as `1,234,567.5`).
- Users can clear a field and type partial values without the formatter
  preventing normal editing.
- Existing validation, blur rounding, error display, labels, and disabled
  behavior remain intact.

## Alternatives considered

### Keep `RateInput` as a wrapper

This would reduce the first migration, but would preserve two concepts and
make future formatting changes easier to apply inconsistently.

### Format each monetary field independently

This would be a small local change for the route basics, but would duplicate
parsing and formatting rules and produce inconsistent edge-case behavior.

The shared `MoneyInput` approach has the best consistency-to-change-cost
tradeoff.

## Verification

Tests should cover comma display, raw unformatted callbacks, decimal limits,
UGX whole-number behavior, exchange-rate precision, blur rounding, and the
guided route basics fields. Existing money-entry tests and relevant route/form
tests should continue to pass.
