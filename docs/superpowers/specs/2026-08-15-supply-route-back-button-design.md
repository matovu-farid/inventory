# Supply Route Wizard Back Button

## Goal

Give users a clear, compact way to leave the supply-route wizard and return to the full Supply Routes list shown in the supplied reference screenshot.

## Design

Add a small, labeled back control above the route title in the shared `SupplyRouteWizard` header:

```text
← All supply routes
Supply route entry
Jan 2026
```

Use the existing muted, inline back-link treatment already used by the item-entry page. The control should be accessible as a named link/button and remain visually subordinate to the route title and status badge.

## Behavior

- The control navigates to `/supply`.
- It uses the wizard's existing exit flow so any pending route-basics changes are persisted before navigation.
- The same control appears for both `/supply/wizard/$routeId` and `/supply/$routeId/entry`, because both render the shared wizard component.
- No changes are made to the stepper Back button, Save and exit action, route status, or list-page behavior.

## Testing

Add a focused component-level regression test for the shared wizard header that verifies:

1. The named “All supply routes” control is rendered.
2. Activating it uses the existing exit behavior and targets the Supply Routes list.

Run the focused test, typecheck, lint, and formatting checks relevant to the changed files.

## Scope

This is limited to the shared wizard header and its regression coverage. No data model, server function, or route structure changes are required.
