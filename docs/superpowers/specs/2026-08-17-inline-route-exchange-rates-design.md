# Inline Route Exchange Rates Design

## Goal

Keep supply-route exchange rates in the route-entry state, but render them as part of the inline item form immediately before the item editor's submit button.

## Context

The supply route already provides `rateRmbPerUsd` and `rateUgxPerUsd`. `AddItemForm` uses those values as defaults and saves any edits as per-entry exchange-rate overrides. The reusable `ItemEditor` currently owns the inline catalog-item form and renders its `Done`/`Save changes` button internally. Because `AddItemForm` renders the route-rate fields after `ItemEditor`, users see the item form finish before they reach the rates.

## Design

Add an optional `beforeSubmitContent` React node to `ItemEditor`. The component renders this content immediately before its existing submit button and remains unaware of supply-route or exchange-rate concepts.

`AddItemForm` remains the owner of rate state, validation, and persistence payload construction. It will:

1. Render its existing controlled exchange-rate fields through `beforeSubmitContent` while the inline create or edit item editor is open.
2. Render the same fields in the route-entry form only when the inline editor is closed, keeping them immediately before the route-entry `Done` button.
3. Keep route defaults (`rateRmbPerUsd` and `rateUgxPerUsd`) and existing-entry overrides unchanged.
4. Avoid showing duplicate rate fields during inline item creation or editing.

Rates remain absent from the standalone catalog item page because they describe a supply-route line, not a catalog item.

## Data flow and validation

The fields remain controlled by `AddItemForm`. Currency determines which fields are visible: UGX has no conversion fields, USD shows only USD/UGX, and other currencies show both foreign/USD and USD/UGX. Existing positive-rate validation and the route-entry persistence payload remain unchanged.

## Testing

Add component coverage that proves:

- `ItemEditor` places supplied `beforeSubmitContent` before its submit button.
- The inline route item form displays the route-prefilled values while the editor is open.
- The rates render once, and the existing preview/persistence flow still receives the same rate values.

No database or server-function changes are required.
