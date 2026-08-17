# Inline Supplier Creation in Item Entry

## Goal

Let users create a missing supplier without leaving the item editor, while
preserving the existing category-style create affordance and selecting the new
supplier for the item automatically.

## User flow

1. The user opens the item editor and focuses **Current supplier**.
2. They type a supplier name that is not an existing supplier.
3. The combobox shows the same plus-style `Create "name"` row used by the
   category combobox.
4. Selecting that row opens a supplier dialog. The supplier name field is
   prefilled with the typed value.
5. The dialog collects the supplier-step fields: name, type, country, phone,
   and description.
6. Saving creates the supplier, closes the dialog, adds it to the local
   supplier options, and selects it as the item’s current supplier.
7. Canceling closes the dialog without changing the item’s supplier.
8. A creation failure keeps the dialog open and shows an inline error.

The created supplier is not linked to the route immediately. The existing
supply-route item save uses the selected supplier and performs the existing
route-linking behavior as part of saving the entry.

## Design

Extend the shared `Combobox` with an optional create-row callback rather than
introducing a second supplier-specific picker. The callback receives the
trimmed unmatched query and closes the picker after the user selects the plus
row. Existing combobox consumers remain unchanged when the callback is absent.

Add a reusable supplier dialog/form component that owns the supplier fields,
validation, pending state, and `createSupplier` call. The item editor opts into
the create row and supplies the callback that opens the dialog. On successful
creation, the editor updates its supplier options and selected ID.

The create capability is opt-in so item-editor consumers that cannot create
suppliers do not expose an action that their role cannot complete.

## Error handling

- Blank or whitespace-only supplier names cannot open the create dialog.
- Server validation and persistence errors are rendered inside the dialog.
- The dialog remains open after failure so entered fields are retained.
- The item editor’s existing item save behavior is unchanged.

## Testing

- Shared combobox: unmatched query renders the plus row; selecting it calls
  the callback with the trimmed name; matching options do not show it.
- Supplier dialog: prefilled name renders, successful creation returns the
  created supplier, cancel does not call the server, and failures remain
  visible without closing.
- Item editor: selecting the create row opens the dialog, and a created
  supplier is added and selected.
- Existing item-editor validation and full test suites continue to pass.
