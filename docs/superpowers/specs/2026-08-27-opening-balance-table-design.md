# Opening Balance Table Design

## Goal

Replace the block-and-variant-matrix opening-balance form with a receipt-style
editable table for both warehouse and shop inventory. The new flow should make
existing stock entry fast while preserving the current stock and accounting
semantics.

## Requirements

- The warehouse and shop pages use one shared table component.
- Shop opening balance keeps its shop selector; warehouse has no destination
  selector.
- An opening-balance row represents one stock lot for one catalog item and one
  variant, or one unresolved item-level lot when colour and size are omitted.
  The same item/variant cannot be entered twice in one submission; the table
  reports that duplicate clearly instead of allowing the database uniqueness
  constraint to fail. This preserves the existing one-time opening-balance
  source semantics and avoids silently merging different costs.
- Item selection uses a server-backed catalog combobox and searches by article
  number first, then design, then item name. Search results are not limited to
  the first 20 unfiltered catalog records; selected items remain cached while
  the query changes. Selecting an item shows its item name, design, primary
  article number, colours, and sizes in the row.
- Colour and size are optional together. When both are chosen, the existing
  variant is used or materialised. When neither is chosen, the existing
  unresolved-stock behavior is preserved. Only one of the pair is invalid.
- Columns are: item, item name, design, art no., colour, size, quantity, unit
  cost (UGX), minimum sell price (UGX), low-stock threshold, and amount. The
  two commercial fields are prefilled from the catalog; minimum sell price is
  sent as the immutable opening-stock snapshot, while low-stock threshold is
  used to initialise the item’s live alert setting. Amount is calculated as
  quantity × unit cost.
- Clicking the trailing blank row creates an editable row. An explicit Add
  opening-balance line button remains available. Each populated row has a
  delete action.
- Rows support the same fill-down interaction as the receipt grid for values
  that can safely repeat: item, colour, size, quantity, unit cost, minimum sell
  price, and low-stock threshold. A fill drag past the current rows creates
  rows, and the whole operation is one undo step. Delete buttons are always
  available, not hover-only.
- The submit mutation accepts the existing grouped server payload, but the UI
  groups only rows with the same item and commercial values. Duplicate
  item/variant rows are rejected before submission. It posts one balanced
  opening-balance journal per grouped item entry and inserts stock rows with
  immutable cost and minimum-sell snapshots.
- Changing the selected shop while any row contains data requires explicit
  confirmation and clears the draft before switching destination.

## Component and data flow

Create a focused opening-balance table state module that owns row creation,
normalisation, validation, amount calculation, duplicate detection, grouping
into the current `items[]` payload, and fill-down/undo helpers. The React form
owns destination selection, catalog item hydration, submission, and
confirmation. A row stores the selected `ItemSummary` plus `colorId` and
`size`; the submit adapter resolves an existing matching `variantId` when
available, otherwise emits `colorId + size` so the server can materialise it,
or `{ variantId: null }` for an unresolved row.

Use the existing `Combobox`, `MoneyInput`, and shadcn `Table` components. Add
server-query support to the item picker rather than relying on a locally
filtered first page. Keep colour and size as compact combobox controls in the
cells so the table remains keyboard- and screen-reader-friendly without
reintroducing the nested variant matrix. Every input has a row/column-specific
accessible name; invalid controls use `aria-invalid` and the form announces
the first validation error.

## Validation and error handling

- Empty trailing rows are ignored; at least one populated row is required.
- Populated rows require an item, positive integer quantity, and positive unit
  cost. Colour and size must be both present or both absent.
- Invalid input prevents submission and identifies the row and field.
- A row with exactly one of colour/size is invalid; a blank pair means
  unresolved stock.
- The shop selector is locked behind confirmation once the draft contains
  data, preventing accidental posting to the wrong shop.
- Submit disables the table and shows the existing confirmation/loading state.
- Server-side validation remains authoritative for item/variant ownership and
  accounting writes.

## Testing and acceptance

- Pure state tests cover row creation, blank-row expansion, amount calculation,
  grouping, duplicate detection, validation, fill-down beyond the last row,
  and undo/redo-relevant transitions.
- Component tests cover catalog search/selection, derived display columns,
  colour/size selection, row add, trailing-row activation, delete, totals,
  accessible validation, shop-switch protection, and disabled submit behavior.
- Server tests cover minimum-sell snapshots, live threshold initialisation,
  duplicate-row rejection, same-item variant grouping, and rollback when one
  row fails. Existing opening-balance tests remain regression coverage.
- Browser testing covers both `/store/opening-balance` and
  `/shop/opening-balance`: search/select an item, choose a variant, enter
  quantity and commercial values, add/delete rows, verify totals, try the
  shop-switch guard, and confirm the confirmation dialog without posting
  test data. Real persistence remains covered by database integration tests
  with cleanup.
