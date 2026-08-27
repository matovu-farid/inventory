# Receipt Quantity Distribution and Item Detail Design

## Goal

Make supplier-receipt quantity entry fast for aggregate, colour-only, and
colour-by-size stock while preserving the relationship between a receipt row,
its allocations, the catalog item, and the stock lots shown on the item-detail
page.

## Findings and scope

The shared custom item-entry grid already supports item name, design, supplier
art number, colours, sizes, quantity, prices, minimum sell price, and the
low-stock threshold. The older `SplitItemForm` already provides the two useful
allocation editors: colour-only quantities and a colour-by-size matrix.

The current catalog `variants` table represents only an item × colour × size
combination. The item-detail page therefore cannot represent colour-only or
undistributed stock as a variant. The current stock tables already preserve
lot-specific cost and minimum sell price, which must remain immutable when
catalog defaults change.

This design covers Supplier Routes receipt entry, receipt persistence and
reload, receiving compatibility, and the item-detail stock presentation. The
shared grid remains reusable by opening balances, but distribution controls
are enabled for receipts first.

## User experience

The quantity cell contains the normal editable quantity input and a compact
`Distribute` action when the row has at least one colour. The action is hidden
or disabled with an explanatory hint when no colours are entered.

- Colours without sizes open a colour-allocation popover.
- Colours and sizes open a colour × size allocation editor in a responsive
  side panel, becoming a bottom sheet on small screens.
- The editor shows the source quantity, allocated quantity, and remaining or
  over-allocated quantity.
- Apply is disabled until every entered allocation is a non-negative whole
  number and the allocation total exactly equals the source quantity.
- Cancel discards the draft allocation. Apply commits the complete
  distribution as one grid edit.
- A distributed quantity cell is visually marked and summarizes its scope,
  for example `500 · 3 colours` or `500 · 3 colours × 4 sizes`.
- Editing the parent quantity after distribution retains the allocations but
  marks the cell out of balance. Saving is blocked until the user edits or
  clears the distribution; no quantities are silently discarded.
- A row with no distribution remains valid and is saved as aggregate or
  colour-only stock, preserving the current workflow.

The editor reuses the existing colour name/hex handling and the existing
`ColorQuantityList` and `VariantGrid` interaction patterns. It must retain
focus while typing, support keyboard navigation, have labelled numeric
controls, and keep the colour picker pointer interaction inside its overlay.

## Data model

Receipt input is represented by two normalized layers:

1. `supply_route_receipt_entries` stores one row per user-entered receipt row:
   item/design identity, supplier art number, total quantity, unit price,
   minimum sell price, low-stock threshold, and display snapshots.
2. `supply_route_receipt_line_allocations` stores the atomic quantity rows:
   receipt-entry id, colour id when resolved, colour name/hex snapshots, an
   optional size, and an integer quantity.

The UI distribution is optional, but persistence always writes at least one
allocation row. A single allocation with no colour or size means the row was
intentionally left aggregate. A set of colour allocations means colour-only
stock. A set containing colour and size cells means fully distributed variant
stock. The parent entry remains the authoritative total and every save must
satisfy:

```text
sum(allocation.quantity) = receipt_entry.quantity
```

The allocation table has foreign keys with cascade deletion from its parent,
non-negative quantity validation, and a uniqueness rule preventing duplicate
colour/size cells within one receipt line. The server validates the sum in the
same transaction that writes the receipt.

The existing `supply_route_lines` table will become the operational materialized
line for each receipt allocation and will carry a `receiptAllocationId` for
receipt-created lines. That link remains nullable for non-receipt operational
lines created by imports or requisitions. The receiving and stock tables
continue to reference these operational lines, so a distributed allocation
resolves directly to one source line and an aggregate entry produces one
unresolved source line. The database should not store UI undo events.

Colours retain both an optional catalog `colorId` and name/hex snapshots so a
free-text colour remains historically accurate even if the catalog changes.
Sizes remain normalized display strings for now, matching the current item and
variant model.

## Save, reload, and receiving flow

On save, the server resolves or creates the catalog item and supplier art-number
mapping first. It resolves or creates colour records and full variants for
distributed cells, then writes the receipt entry, allocation rows, and
operational source lines atomically. Amounts, foreign-currency totals, UGX
costs, and receipt snapshots are calculated server-side.

On receipt reload, the server returns one draft row per parent receipt entry and
hydrates its allocation rows. It must not expose each allocation as an
unrelated duplicate grid row.

Receiving reads the allocation rows when present. A colour-and-size allocation
can enter stock as its matching variant. An aggregate or colour-only line
remains explicitly unresolved and can be split later using the existing
receiving flow. No allocation may be lost or counted twice.

Minimum sell price and cost are snapshots on the receipt and resulting stock
lot. Changing the item’s current defaults affects future stock only. The
low-stock threshold remains the live item-level setting with default `0`; the
receipt retains the entered threshold as history.

## Item-detail view

The item-detail page remains catalog-item-centric rather than receipt-row-
centric. Its existing identity area continues to show item name as the broad
category, design as the specific style, colours, sizes, and all supplier art
numbers.

The stock presentation is expanded into three explicit states:

- **Variant stock:** colour × size rows from the existing `variants` table,
  grouped by colour with quantity and location counts.
- **Colour-only stock:** quantities grouped by colour and labelled `Size not
  assigned`.
- **Unspecified stock:** quantities with no colour or size, labelled
  `Variant not assigned`.

The item page also adds expandable receipt/stock-lot details under each stock
group. It shows supplier, receipt date/reference, quantity, unit cost, minimum
sell price, and the source receipt entry. This prevents restocks from different
suppliers or different prices from being collapsed into an ambiguous current
item value.

The catalog Prices section continues to show current item defaults separately
from stock-lot prices. Existing stock rows are never rewritten when a later
receipt changes those defaults. A zero low-stock threshold means alerts are
disabled and is displayed as such rather than as missing data.

## Grid history and copying

All mutations go through a small receipt-grid event reducer. Events include
cell edits, row insertion/deletion, paste, fill-down, and distribution
apply/clear. Undo and redo operate on committed grid events; opening or
cancelling an allocation editor does not create history.

Copy, clipboard paste, and drag-fill copy the quantity plus its complete
distribution as a deep value. The destination receives independent allocation
objects, so editing its distribution cannot alter the source row. Dragging
beyond the last row creates rows before applying the copied value.

## Validation and error handling

- No colours means no distribution action is required.
- Allocations must use only entered colours and sizes, contain whole
  non-negative quantities, and total exactly to the parent quantity.
- Duplicate colour/size cells are rejected before persistence.
- Server validation repeats all client validation and returns row/field-level
  messages rather than raw database errors.
- A failed save leaves the draft editable and does not partially create catalog
  items, colours, variants, receipt rows, stock, journals, or audit records.
- Item-detail queries aggregate unresolved, colour-only, and full-variant stock
  separately so no valid quantity disappears from the UI.

## Testing and manual verification

Pure state tests cover allocation totals, mismatch handling, event undo/redo,
deep-copying distributions, paste, fill-down beyond the last row, row delete,
and aggregate rows.

Component tests cover the colour-only popover, colour-by-size side panel,
keyboard/focus behavior, apply/cancel, visible allocation summaries, and
accessible validation.

Server tests cover normalized parent/allocation writes, reload reconstruction,
free-text colour snapshots, item and article-number reuse, duplicate-cell
rejection, receiving behavior for all three stock states, price snapshots,
threshold default `0`, and transaction rollback.

Manual browser verification on the local app covers:

1. Enter a receipt row with colours only, distribute quantities, reopen and
   edit the allocation, then verify the quantity summary and review totals.
2. Enter colours and sizes, distribute through the matrix, copy and drag-fill
   the quantity cell, edit the copied distribution, and verify independence.
3. Exercise undo/redo after distribution, copy, fill, quantity mismatch, and
   row deletion.
4. Save and reopen the receipt, verify the row reconstructs as one row, then
   inspect the item-detail page for variant, colour-only, and unresolved stock.
5. Verify later changes to item defaults do not change existing stock-lot cost
   or minimum sell price, and confirm the threshold default and display.

## Non-goals

- Persisting the client undo/redo event log in the database.
- Requiring distribution before saving a receipt.
- Creating fake variants for colour-only or aggregate stock.
- Replacing the existing item-detail catalog identity model with receipt rows.
- Reintroducing Glide Data Grid or adding a general spreadsheet dependency.
