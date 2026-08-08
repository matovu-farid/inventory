# Guided Supply Route Entry Design

## Status

Approved during brainstorming on 2026-08-08. This document defines the UX and technical shape for entering suppliers, items, and purchases through a resumable supply-route flow.

## Goal

Make supply-route entry match the real workflow: a user may purchase items during a trip, return to a hotel or other workspace, enter some details, and come back on later days to add the rest. The flow must make supplier, category, item, and purchase information easy to create or select without losing the flexibility already supported by the current route editor.

## Confirmed decisions

- The guided flow is the primary way to create a new supply route.
- A route may contain purchases from multiple suppliers.
- Existing items can be selected, and their reusable item data can be reviewed/edited separately from the current purchase.
- New suppliers, categories, and items can be created inline.
- Existing records remain editable; destructive deletion is prevented once a record is referenced. Referenced records can be archived and later restored.
- Archived records remain searchable and are clearly marked as archived.
- The flow auto-saves route changes and completed supplier/item changes.
- An unfinished item form is discarded when the user leaves; it is not persisted as a backend item draft.
- Route dates are stored at the route level only. A route may span multiple entry days.
- The flow uses a compact horizontal progress stepper.
- Item entry uses grouped, expandable sections.
- The existing flexible procurement behavior is preserved: aggregate quantity, quantity per color, quantity per color × size, inline color creation, and later splitting of unresolved entries.
- A route purchase supplier may differ from an item's current supplier. The route supplier is the default purchase supplier, and the user is asked whether to make a differing supplier the item's new current supplier.

## User flow

### Entry screen

Opening the flow presents three explicit choices:

1. **Continue most recent route** — shown prominently but never selected automatically.
2. **Select another open route** — lists open routes, including routes with partial receiving activity.
3. **Start a new route**.

If no open route exists, the first option is omitted and the new-route option is the primary action.

### New-route path

New routes follow these steps:

1. **Route Basics**
2. **Suppliers**
3. **Items**
4. **Review**

Only the route name is required to create the route. Dates, budget, exchange rates, and notes can be completed later. The route is created immediately as an open record so it can be resumed.

### Existing-route path

Selecting an existing route opens directly on **Items**. The screen shows a compact route summary and an **Edit route details** action that opens Route Basics without forcing the user through it again.

The horizontal stepper remains visible. Save and exit is available at every step, and the most recent save state is displayed.

## Supplier behavior

The Suppliers step displays suppliers linked to the route. Users can select existing suppliers or create a supplier inline.

Inline supplier creation presents the essential fields first:

- Name
- Type
- Country

Contact name, phone, email, and notes remain available under a More details section. A newly created or selected supplier is added to the route supplier list automatically.

While adding an item, the user can still create or select another supplier inline. This supplier is added to the route list without requiring the user to leave the item entry.

## Item behavior

Item entry is one item at a time. After an item is completed, it is added to an editable route summary with actions to edit, delete, or add another item. This keeps item creation focused while allowing a table/list overview for the route.

### Existing item

Selecting an existing item opens its reusable data in grouped sections. Changes to item identity, category, commercial profile, or variants are distinct from changes to this route purchase.

### New item

New item creation uses grouped expandable sections in this order:

1. **Current supplier and category**
2. **Item information**
3. **Commercial profile**
4. **Purchase details**

The article number is generated from the category and item name, then remains editable before saving. The item information section includes item name and description. The commercial profile includes current supplier cost, cost currency, minimum sell price, low-stock threshold, sizes, and colors as applicable.

Categories can be selected or created inline. Category names can be edited later while retaining historical references through a category record/reference rather than an untracked text-only rename.

### Route supplier and item supplier

The item's current supplier is the default suggestion for the route purchase. The user can choose a different route supplier for this specific purchase.

When the selected route supplier differs from the item's current supplier, the flow asks whether to update the item's current supplier. The default behavior is to leave the reusable item profile unchanged unless the user confirms the update.

The route line stores a supplier and cost snapshot so later changes to the item profile do not rewrite historical procurement records.

### Procurement detail modes

The current route-entry modes remain available:

- **Total only** — record an aggregate quantity.
- **Per color** — record quantity per color; sizes may be filled later.
- **Per color × size** — record the full variant grid.

Users can add colors while entering the item. Aggregate and color-only entries remain eligible for the existing split/specify flow before or after receiving according to current product rules.

## Route lifecycle

The route lifecycle describes receiving/data completeness, not the user's physical travel status.

### Persisted state

Persist only two route states:

- **open** — the route can still be entered and may receive additional purchase lines.
- **received** — every route line has been received and the route is locked.

The existing `planning` and `in_transit` states are migrated to `open`.

### Display status

The UI derives a third display label from receipt records:

- **Open** — no lines have been received.
- **Partially received** — some lines are received and some remain outstanding. The persisted state remains `open`.
- **Received** — all lines are received and the persisted state is `received`.

Rules:

- New items can be added to open or partially received routes.
- Unreceived lines can be edited or deleted.
- Received lines cannot be edited or deleted.
- A fully received route cannot accept new lines.
- The receiving screen lists open routes with unreceived lines and continues to support partial receiving.

### Review and exit

The user can save and exit at any point. Review appears when the user clicks **Finish route**. Review displays:

- Route name and route-level dates
- Suppliers
- Items grouped by supplier
- Quantities and variant detail
- Purchase costs and currencies
- Exchange-rate overrides
- Warnings for unresolved or incomplete information

The user can go back to edit, save and exit, or finish the route.

## Auto-save and failure behavior

- Route field changes auto-save with a short debounce.
- Completed supplier and item entries save immediately.
- The UI shows Saving, Saved, or Could not save — Retry.
- A failed save preserves the user's current form values.
- Completed route lines are never silently removed.
- An incomplete item form remains client-side only and is discarded when the user leaves.

## Technical boundaries

Implement a new route-builder UI/orchestrator that reuses the existing supplier form, item editor, item picker, variant grids, split flow, pricing calculations, and receiving components. Avoid duplicating the domain calculations already used by the current route editor.

Required backend/schema work:

1. Migrate `supply_route_status` from `planning`/`in_transit`/`received` to `open`/`received`.
2. Update route queries, list filters, status labels, and receiving transitions to derive partial receiving from receipt records.
3. Ensure receiving sets `received` only when every route line has a receipt; otherwise keep the route `open`.
4. Make `addSupplyRouteVariants` use an explicit route supplier override when provided, falling back to the item current supplier.
5. Add archive fields and restore operations for suppliers and items.
6. Introduce a durable category record/reference and migrate existing item category values so renames preserve historical references.
7. Add guarded edit/delete operations where missing, with reference checks and archive guidance.

## Error handling

- Validate route and item fields inline before advancing.
- Preserve the current step on server errors.
- Show actionable errors for duplicate records, invalid exchange rates, invalid quantity grids, and referenced-record deletion attempts.
- Prevent advancing from Review while required values are missing, but allow Save and exit with a clearly marked incomplete route.
- Keep route-level defaults and item-level overrides explicit so calculated totals are explainable.

## Testing strategy

### Unit and server tests

- Route state migration and derived open/partially received/received status.
- Receiving transition rules for zero, partial, and complete receipts.
- Route-specific supplier override and item-profile update prompt behavior.
- Category rename/archive/reference behavior.
- Archive and restore rules for suppliers/items.
- Existing aggregate, per-color, and per-color × size materialization and split behavior.

### Integration and end-to-end tests

- Start a new route, save it, leave, and resume it.
- Continue the most recent route and select another open route.
- Add multiple suppliers and create one inline while adding an item.
- Create and edit an item through grouped sections.
- Add purchases on multiple days to one route.
- Edit/delete unreceived lines and reject changes to received lines.
- Add lines to a partially received route and lock a fully received route.
- Recover from an auto-save failure without losing form values.
- Complete Review and confirm the route summary.

## Scope boundaries

This design does not introduce persisted drafts for incomplete item forms, item-level purchase dates, automatic silent route selection, or a separate physical-trip status. It also does not remove the existing standalone Suppliers and Items administration pages; those remain useful for maintenance and bulk review.
