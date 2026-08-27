# Shared Item Entry Grid Design

## Goal

Use the same receipt-style editable item table for Supplier Routes receipts,
Warehouse opening balance, and Shop opening balance. The shared editor should
make item entry fast and predictable while allowing each flow to supply its own
save semantics and financial labels.

## Scope

This change replaces the duplicated opening-balance table interaction layer
with the existing custom Supplier Routes grid behavior, extracted into a
configurable shared component. It does not reintroduce Glide Data Grid or add a
new general-purpose spreadsheet dependency.

The shared component owns editing behavior and presentation of item-entry
columns. The parent flow owns destination/supplier fields, draft persistence,
validation messages, submission, and confirmation dialogs.

## User experience

Both flows use the same columns and interactions:

- Item name is the broad category, such as `Shirt`.
- Design is the specific style, such as `Round neck`.
- Art No. is the supplier-facing or user-entered article number.
- Design editing searches the catalog as the user types. Results are ranked by
  article number first, then design, then item name. Selecting a result fills
  the row's item name, design, art number, colours, sizes, and commercial
  defaults.
- A row can remain free text. Colours accept names, comma-separated names, and
  custom picker values; sizes accept comma-separated values. The existing
  colour picker and name/hex conversion behavior are reused unchanged.
- Clicking the trailing blank row activates it and creates another blank row.
  The explicit Add line button remains available. Populated rows can be
  deleted.
- Clicking a cell selects it. The fill handle copies that cell's safe value
  down, creates rows when dragged beyond the current end, and is recorded as a
  single undo step. Clipboard tab/newline paste, keyboard undo, and keyboard
  redo remain available.
- Text and placeholders use accessible foreground colors. Every editor has a
  row/column-specific accessible name, and disabled state prevents editing
  while a save is pending.

The table has a configurable mode:

- Receipt mode labels the cost column `Unit price`, uses the receipt currency,
  and shows foreign-currency totals.
- Opening-balance mode labels the cost column `Unit cost (UGX)`, uses whole
  UGX values rounded to the existing 50-UGX rule, and shows UGX totals.

## Shared component boundary

Create `ItemEntryGrid` as the single implementation of the table interaction
layer. Its row model contains the common item-entry values:

- `itemName`, `design`, `itemId`, and optional hydrated catalog item
- `articleNumber`
- `colorText`, `colorHexText`, and resolved `colorIds`
- `sizeText`
- `quantity`
- `unitPriceForeign` (the shared raw cost field; opening mode interprets it as
  UGX)
- `minimumSellPriceUgx` and `lowStockThreshold`

The component receives a mode/column configuration, catalog-search scope,
disabled state, rows, and `onRowsChange`. It may expose history controls to a
parent that already keeps draft-level undo/redo. `ReceiptGrid` becomes a thin
compatibility wrapper or is renamed without leaving a second implementation.

The shared state helpers provide row creation, blank-row detection, parsing,
amount calculation, paste, fill-down, and validation primitives. Opening
balance-specific grouping remains an adapter concern and must not be encoded in
the grid renderer.

## Catalog lookup and free-text creation

Receipt mode searches active items scoped to the selected supplier. Opening
balance searches active items without a supplier filter because the destination
is a warehouse or shop, not a supplier receipt.

When a user selects an existing item, the row keeps its item id and the server
reuses that catalog item. If the entered art number is not already attached to
that item, the server adds it as another article-number mapping after checking
ownership in the item's supplier scope (or as an unqualified mapping for a
supplier-neutral item). When the user enters a new opening-balance row, the
row can omit `itemId` and is saved as a new catalog item. Because opening
balance has no supplier selector, this new item is supplier-neutral:

- `items.supplierId` is null.
- The entered art number is stored as the visible raw article number with no
  supplier qualification.
- The entered item name defaults to the design when item name is blank, matching
  receipt behavior.
- The opening row's UGX cost, minimum sell price, and low-stock threshold seed
  the new item's current defaults.

Supplier Routes continue to require a supplier and use the supplier-code prefix
for new and additional article-number mappings. A free-text receipt row keeps
the current receipt creation behavior and remains supplier-owned.

## Opening-balance persistence

Opening balance submits row-oriented data to a single transaction for either
warehouse or shop. The server resolves an existing item by id when supplied;
otherwise it creates the supplier-neutral item and its article number. It then
reuses or materializes colours and colour/size variants from the row before
inserting the stock lot.

The server must validate item ownership, article-number conflicts, colour/size
ownership, duplicate item/variant rows, positive quantities/costs, non-negative
minimum sell prices, and whole non-negative thresholds. Any failure rolls back
new catalog records, variants, stock, journal entries, and audit records.

Opening-stock lots receive immutable `costPerUnitUgx` and
`minimumSellPriceUgx` snapshots. The item's current minimum sell price and
low-stock threshold are updated from explicit row values for future stock;
threshold `0` disables the alert. Existing stock lots are never rewritten by a
later opening balance or catalog-default change.

Rows with identical item/commercial settings may be grouped for journal posting,
but duplicate item/variant cells are rejected before posting. Rows with
different costs or commercial settings remain separate groups.

## Receipt persistence

Receipt mode continues using the existing receipt create/replace server path.
The adapter maps shared rows to the current receipt payload, preserving free-
text item/design creation, supplier-qualified article numbers, colour/hex
materialization, variants, receipt-line snapshots, and commercial setting
updates. Existing received receipts remain locked.

## Error handling and accessibility

- Empty trailing rows are ignored on save; at least one populated valid row is
  required.
- New free-text rows identify the missing item name/design/art number rather
  than reporting a generic catalog-link error.
- Validation errors identify the visible row and field and are announced by the
  parent form.
- Save disables the entire grid and shows the existing centered loading overlay.
- Search failures remain local to the editor and do not erase typed text.
- A colour picker remains open while its pointer is dragged; pointer events are
  contained by the picker and do not trigger outside-click dismissal.

## Testing

### Shared state and component tests

- common row creation, parsing, amount calculation, blank-row activation,
  add/delete, undo/redo, clipboard matrix paste, and fill-down beyond the last
  row
- design search selection populating the complete row
- free-text item/design entry and comma-separated colour/size editing
- colour picker pointer interaction and visible foreground text
- receipt and opening-balance column labels/totals
- disabled state and accessible validation

### Server tests

- existing opening-balance item reuse
- supplier-neutral free-text item creation with article number
- colour and variant reuse/materialization
- minimum-sell and cost snapshots
- threshold default `0` and explicit threshold updates
- duplicate/conflicting rows and transaction rollback
- receipt regression coverage for supplier-scoped search and qualified article
  numbers

### Browser tests

Using the local app, manually test:

1. `/supply/.../entry?step=items`: select an existing item, type a free-text
   receipt row, edit colours with the picker, enter sizes, fill down, undo/redo,
   save, and inspect review.
2. `/store/opening-balance`: search/select an item and create a free-text item,
   verify the shared table columns and UGX totals, exercise add/delete/fill
   down, and confirm the loading/confirmation behavior without posting unsafe
   test inventory.
3. `/shop/opening-balance`: repeat the shared table checks and verify the shop
   destination selector remains separate from the table.

## Non-goals

- No historical-data migration beyond the existing schema and supplier-code
  work.
- No change to the meaning of receipt suppliers or supplier-qualified article
  numbers.
- No redesign of the item detail page or opening-balance confirmation dialog.
- No silent merging of duplicate stock lots with different costs.
