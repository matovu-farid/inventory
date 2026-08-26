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
  low-stock alert.
- A receipt row sends the entered minimum sell price and threshold. For an
  existing item, those values update the item defaults for future stock. The
  current receipt line and already-created stock rows remain unchanged.
- If a receipt contains the same item more than once with conflicting item
  defaults, the save is rejected with a clear message rather than silently
  choosing the last row.

## Data flow

1. The grid initializes the two fields from the selected catalog item, or
   `0` for a new item.
2. Saving validates non-negative UGX minimum price and integer threshold.
3. The server resolves/creates the item, updates its current defaults, and
   writes the receipt-line minimum sell price snapshot.
4. Receiving creates stock with the receipt-line cost and minimum sell price.
5. Transfers and sales use only the stock/transfer allocation snapshot. They
   never fall back to `items.minimumSellPriceUgx` for an existing lot.
6. Review displays the receipt-line minimum sell price; item screens label
   item defaults separately from stock-lot values.

## Error handling

- Negative or malformed minimum prices are rejected as invalid UGX values.
- Negative, fractional, or malformed thresholds are rejected.
- Conflicting defaults for duplicate item rows in one receipt are rejected.
- Existing received receipts remain locked by the current route rules.

## Verification

- Unit tests cover row defaults and parsing.
- Server tests cover new item creation, existing-item restock, default updates,
  receipt snapshots, and duplicate-row conflicts.
- Stock/sales tests prove changing an item default does not change an existing
  lot's minimum sell price.
- Typecheck, lint, focused tests, and the applicable full suite must pass.
- Browser testing covers entering both fields, saving, revisiting the receipt,
  checking the item defaults, and confirming an existing stock lot remains
  unchanged after a later receipt changes the item default.
