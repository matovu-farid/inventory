# Receipt Item Commercial Settings Design

## Goal

Make receipt entry the place where item defaults are set while preserving the
financial truth of stock already received. A receipt row will expose minimum
sell price and low-stock threshold; saving updates the catalog item defaults,
but existing stock lots retain their original cost and minimum sell price.

## Decisions

- `items.costPrice`, `items.costCurrency`, and `items.minimumSellPriceUgx` are
  the current defaults used for future receipts and catalog editing.
- `supply_route_lines.minimumSellPriceUgx` is the receipt-line snapshot.
  `unitPriceForeign` plus the calculated `totalCostUgx` are the receipt cost
  snapshot.
- `store_stock` and `shop_stock` keep the lot snapshots copied from the
  receipt/transfer source. A stored value of `0` is meaningful and must not be
  replaced with the current item default.
- `items.lowStockThreshold` is a live item-level operational setting, not a
  financial lot snapshot. It becomes `NOT NULL DEFAULT 0`; `0` disables the
  low-stock alert. `supply_route_lines.lowStockThreshold` is also stored as a
  receipt-history snapshot so review and reload show what was entered on that
  receipt; stock availability checks use the live item threshold.
- A receipt row sends the entered minimum sell price and threshold. For an
  existing item, those values update the item defaults for future stock. The
  current receipt line and already-created stock rows remain unchanged.
- A minimum sell price of `0` means that no minimum floor is configured. Sale
  prices still must be positive. This meaning is consistent across item
  editing, receipt entry, stock lots, transfers, sales, and POS validation.
- If a receipt contains the same item more than once with conflicting item
  defaults, the save is rejected with a clear message rather than silently
  choosing the last row.

## Data flow

1. The grid initializes the two fields from the selected catalog item, or
   `0` for a new item.
2. Saving validates non-negative UGX minimum price and integer threshold.
3. The server resolves/creates the item, updates its current defaults, and
   writes the receipt-line minimum sell price and threshold snapshots.
4. Receiving, opening balances, and returns create stock with explicit cost and
   minimum-sell-price snapshots. Transfers and sales copy and consume those
   snapshots without a live-item fallback.
5. When multiple lots are sold together, the effective minimum sell price is
   the maximum of their stored lot floors; an all-zero set has no floor.
6. Review displays receipt-line snapshots; item screens label item defaults
   separately from stock-lot values.

## Error handling

- Negative or malformed minimum prices are rejected as invalid UGX values.
- Negative, fractional, or malformed thresholds are rejected.
- Conflicting defaults for duplicate item rows in one receipt are rejected.
- Replacing a receipt rewrites its receipt-line snapshots atomically and may
  update item defaults; deleting a receipt never rolls item defaults backward.
- Existing received receipts remain locked by the current route rules.

## Verification

- Unit tests cover row defaults and parsing.
- Server tests cover new item creation, existing-item restock, default updates,
  receipt snapshots, and duplicate-row conflicts.
- Stock, transfer, sales, POS, and return tests prove changing an item default
  does not change an existing lot's cost or minimum sell price, including a
  stored zero floor.
- Typecheck, lint, focused tests, and the applicable full suite must pass.
- Browser testing covers entering both fields, saving, revisiting the receipt,
  checking the item defaults, and confirming an existing stock lot remains
  unchanged after a later receipt changes the item default.
