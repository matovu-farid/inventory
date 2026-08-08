# Top-Level Item Entry and Route Supplier Defaults

## Context

The Items page currently opens the item editor directly from a button. Users
can browse or search items, but there is no clear start point that presents
the two actions together: select an existing item to edit or create a new
item. The supply-route item form also leaves the purchase supplier blank when
the selected item's current supplier is not one of the route's supplier links,
even when the route already has a supplier selected.

## Decision

Add a dedicated top-level item entry page that follows the supply-route start
pattern:

- Search and select an existing item; selecting it navigates to that item's
  existing edit/detail page.
- Start a new item; this opens the existing item editor for creation.
- Keep the current Items page as the catalog browsing/search surface.

In the supply-route item form, default the editable purchase supplier using
this priority when a product is selected:

1. The item's current supplier, if it is already attached to the route.
2. The route's first supplier, if the route has suppliers.
3. The item's current supplier, if no route supplier list is available.

The user can always change the supplier manually. Editing an existing route
entry continues to use the supplier saved on that entry and must not be
overwritten by the defaulting logic.

## User experience

The Items page's primary action navigates to the new item start page instead of
opening the editor immediately. The start page contains:

- a prominent existing-item search/list;
- a clear `Create new item` action;
- an empty state that still makes creation available when no items exist.

Selecting an existing item is an edit intent, so it opens the established item
detail/edit route. The flow does not create a duplicate item or start a supply
route.

The supply-route form displays the selected default supplier in the Purchase
supplier control as soon as an item is chosen. The control remains editable,
and the existing route-specific override behavior and confirmation prompt for
changing the item's catalog supplier remain unchanged.

## Architecture and data flow

- Add a route such as `/items/new` with a loader for the searchable item list
  and the existing item-editor prerequisites (categories and suppliers).
- Reuse the existing item search server function and item editor component;
  do not create a second item-creation form.
- Use the selected item's `supplier.id` and the route form's supplier options
  to calculate the default purchase supplier locally. No schema change is
  needed because the selected supplier is already submitted as the route-line
  `supplierId`.
- When the top-level chooser navigates to an item, use the existing article
  number route so all current editing, archiving, and catalog behavior stays
  in one place.

## Edge cases and errors

- If an item has no current supplier, fall back to the first route supplier.
- If the item supplier is not linked to the route, do not display an invalid
  select value; use the first route supplier instead.
- If there are no route suppliers, preserve the item's current supplier as the
  submitted fallback and keep the existing validation behavior.
- If the item search returns no results, show a useful empty state with a
  direct create action.
- Existing-entry edits retain their saved supplier, including when that
  supplier differs from the current catalog supplier.

## Verification

Tests should cover the chooser's create and existing-item navigation, the
empty search state, and supplier default priority: item supplier on route,
route fallback, item supplier with no route options, and existing-entry edit
preservation. Existing item and supply-route tests must continue to pass.
