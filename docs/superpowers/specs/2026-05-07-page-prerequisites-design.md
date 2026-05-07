# Page Prerequisites Pattern — Design Spec

**Date:** 2026-05-07
**Status:** Approved for planning
**Owner:** matovu-farid

## Problem

The Receive Goods page shows supply routes in a dropdown that have already been fully received (e.g., "China Trip (received)" remains selectable even after every item on the route has a `StoreReceiving` row). More broadly, several pages in the inventory app become non-functional when their upstream data prerequisites aren't met, but the pages give the user no clear indication of *what's missing* or *where to go to fix it*. There is no system-wide view of "what does an admin need to set up to make the app fully usable."

## Goals

1. Fix the dropdown bug: `/store/receiving` must not list supply routes whose items have all been received.
2. Establish a reusable pattern for declaring per-page data prerequisites with structured "what's missing + where to fix" messaging.
3. Surface a single system-wide setup checklist (`/settings/setup`) so a new admin can see at a glance what to do next.
4. Apply the pattern to every page in the app whose usefulness depends on upstream data.

## Non-goals

- No changes to the underlying domain model (no new tables, no migrations).
- No reorganization of unrelated empty states (e.g., "No customers yet" stays as inline-add since it has no upstream prereqs).
- No onboarding wizard, tour, or guided tutorial — just a checklist + contextual empty states.

## Dependency Graph

```
                        /supply/suppliers   (no deps)
                                 │
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
        /supply           /supply/$routeId      (create supplier)
           │ needs route in
           │ in_transit/received
           ▼
   /store/receiving ───── produces store stock
           │
           ├──────────────┬──────────────┐
           ▼              ▼              ▼
        /store      /store/transfers  (consumed below)
                          │ needs ≥1 shop AND store stock
                          │ produces shop stock
                          ▼
                ┌─────────┴────────────┐
                ▼                      ▼
              /shop                /shop/sales

   /shop/opening-balance  → needs ≥1 shop
   /store/opening-balance → no hard deps
   /, /customers, /reports, /reports/ledger, /settings → no hard deps
```

## Architecture

### Data shape

A single shared TypeScript type drives both per-page prereqs and the system-wide checklist.

```ts
// src/lib/prerequisites/types.ts
export type PrereqSeverity = "hard" | "soft"

export interface PrereqAction {
  label: string          // e.g., "Go to Supply Routes"
  href: string           // e.g., "/supply"
}

export interface MissingPrereq {
  id: string                                  // stable key, e.g. "no-receivable-routes"
  severity: PrereqSeverity
  title: string                               // "No supply routes ready to receive"
  why: string                                 // user-facing explanation, 1-2 sentences
  actions: [PrereqAction, ...PrereqAction[]]  // non-empty: every prereq has a CTA
}

export interface PrerequisiteResult {
  satisfied: boolean              // true iff no `hard` prereqs are missing
  missing: MissingPrereq[]        // both hard and soft, in display order
}
```

`actions` is typed as a non-empty tuple so the compiler enforces that every missing prereq carries at least one CTA link.

### Where prereqs are computed

Server-side, in dedicated functions in `src/server/functions/prereqs/<page>.ts` (one file per page or grouped logically). Each route loader calls the relevant prereq function and merges the result into its return value:

```ts
export const Route = createFileRoute("/store/receiving")({
  loader: async () => {
    await ensureStore()
    const [routes, prerequisites] = await Promise.all([
      listReceivableRoutes(),
      getReceivingPrereqs(),
    ])
    return { routes, prerequisites }
  },
  component: ReceivingPage,
})
```

This avoids a second client round-trip and lets the prereq logic share helper queries with the loader where helpful. For the global checklist, a single `getSystemPrereqs()` server function calls all per-page prereq functions in parallel and aggregates results.

### Render rules

| State | Behavior |
|---|---|
| `satisfied: true`, no soft prereqs | Render page content unchanged |
| `satisfied: true`, soft prereqs present | Render `<PrereqBanner>` above page content |
| `satisfied: false` | Replace page body with `<PrereqEmptyState>` (page header still renders so user knows where they are) |

## Components

All in `src/components/prerequisites/`:

### `<PagePrerequisites>`

Wraps the **body** of every page that uses the pattern. The page's `<h1>` and subtitle are rendered *outside* the wrapper so the user always sees which page they're on, even when prereqs fail.

```tsx
<div className="space-y-6">
  <div>
    <h1 className="text-2xl font-bold">Receive Goods</h1>
    <p className="text-muted-foreground">Receive items from a supply route.</p>
  </div>
  <PagePrerequisites result={prerequisites}>
    {/* normal page content goes here */}
  </PagePrerequisites>
</div>
```

Behavior follows the render rules above.

### `<PrereqEmptyState>`

The focused empty state shown when hard prereqs fail. Built on existing shadcn `Card` + `Alert` primitives. Shows:

- Icon + title ("Set up required" or page-specific)
- Subtitle line
- Checklist of all missing prereqs — one row per item with title, `why`, and CTA buttons

Reused by `/settings/setup` with an extra optional `pageHref`/`pageLabel` per row (so each row also links to the page it unblocks).

### `<PrereqBanner>`

A small dismissible alert at the top of the page for soft prereqs. Built on the existing `Alert` component. Not blocking.

**Reuse:** the existing `InfoTip`, `Card`, and `Alert` primitives are sufficient — no new design system work needed.

## Per-page prerequisite declarations

| Page | Hard prereqs | Soft prereqs |
|---|---|---|
| `/store/receiving` | ≥1 supply route in `in_transit` or `received` with ≥1 unreceived item | — |
| `/store/transfers` | (a) ≥1 shop, (b) ≥1 store stock row with `quantityOnHand > 0` | — |
| `/shop/sales` | ≥1 shop | ≥1 sale recorded |
| `/shop/opening-balance` | ≥1 shop | — |
| `/shop` | — | ≥1 stock at selected shop *(only when a shop exists; the existing inline "Add Shop" dialog already handles the no-shops case — we don't duplicate it as a prereq)* |
| `/store` | — | ≥1 stock item |
| `/supply` | — | ≥1 supplier |
| `/supply/$routeId` | — | ≥1 supplier |
| `/`, `/customers`, `/reports`, `/reports/ledger`, `/settings`, `/store/opening-balance`, `/supply/suppliers` | — | — |

### Action mapping (CTA links)

| Missing prereq | CTAs |
|---|---|
| No receivable supply routes | `[Go to Supply Routes → /supply]` |
| No shops configured | `[Go to Shop → /shop]` |
| Warehouse has no stock | `[Receive Goods → /store/receiving]`, `[Set Opening Balance → /store/opening-balance]` |
| No suppliers | `[Go to Suppliers → /supply/suppliers]` |
| No sales yet (`/shop/sales`) | `[Record a Sale → /shop]` |
| No stock at selected shop (soft, `/shop`) | `[Transfer from Warehouse → /store/transfers]`, `[Set Opening Balance → /shop/opening-balance]` |
| No stock in warehouse (soft, `/store`) | `[Receive Goods → /store/receiving]`, `[Set Opening Balance → /store/opening-balance]` |

### Special cases

- **Transfers:** when only the *shop* prereq fails, the message is "No shops configured." When only *stock* fails, "Warehouse has no stock." When both fail, both rows appear in the checklist.

## Dropdown bug fix

The bug: `listReceivableRoutes` (in `src/server/functions/store/receiving.ts`) returns routes with status `"in_transit"` or `"received"` without checking whether all items already have receipts.

**Fix:** introduce a shared helper `getReceivableRoutesWithUnreceivedItems()` in the same file that:

1. Loads all routes in `in_transit` or `received` status with their `items`
2. Loads `storeReceivings.supplyRouteItemId` for all items in those routes (one batched query)
3. Filters routes to those with at least one item missing a receipt

Both `listReceivableRoutes` (used by the dropdown) and the receiving prereq function call this helper. Result: the "China Trip (received)" entry disappears the moment its last item is received.

**Side effect on UX:** the existing `routes.length === 0` empty-state block in `src/routes/store/receiving.tsx` is removed — `<PagePrerequisites>` handles it now with a richer message and CTA.

## The Setup Checklist page (`/settings/setup`)

A new route. One server function `getSystemPrereqs()` calls every page-level prereq function in parallel and returns:

```ts
{
  totalChecks: number,
  passing: number,
  failingHard: number,
  failingSoft: number,
  items: Array<MissingPrereq & {
    pageHref: string    // the page this prereq unblocks
    pageLabel: string   // sidebar label for that page
  }>
}
```

The page renders:

- A header with progress: "5 of 8 system checks passing"
- Hard-failures section first (red), then soft (yellow), then a green "All set" section listing what's working
- Each failing row reuses the same `MissingPrereq` shape with a secondary "Open page →" link to the affected page

### Discoverability

- Sidebar gets a small badge on "Settings" when there are unresolved hard prereqs (e.g., "⚠ 2"). Hidden when zero.
- Dashboard (`/`) gets a top banner: "2 setup steps need attention" → `/settings/setup`. Shown only when failing hard prereqs > 0.

## Testing strategy

Following the project's existing convention of testing against a real Postgres (no DB mocks).

- **Unit tests** for each prereq function in `src/__tests__/prereqs/<page>.test.ts`. Each function is a pure-ish DB-in / `PrerequisiteResult`-out function. Cover: all-missing, partial-missing, all-satisfied, edge cases.
- **Unit test** for `getReceivableRoutesWithUnreceivedItems` specifically, including the regression case from the screenshot: a route with `status="received"` and all items received → must be excluded.
- **Component test** for `<PagePrerequisites>`: given `satisfied: true` renders children; given `satisfied: false` renders empty state; soft prereqs render banner above children.
- **Cypress E2E** on the receiving flow:
  1. Empty DB → visit `/store/receiving` → see empty state with CTA → click CTA → land on `/supply`.
  2. After adding a route, items, transitioning, and receiving — revisit `/store/receiving` and confirm the route disappears from the dropdown once fully received.
- **Cypress E2E** on `/settings/setup`: empty DB shows all hard checks failing with CTAs; after adding a shop + supplier + receivable route, the page shows them as passing.

## Build order

Each step is a separate commit and shippable on its own. The bug is fixed at step 2.

1. **Foundation:** `src/lib/prerequisites/types.ts`, `<PagePrerequisites>`, `<PrereqEmptyState>`, `<PrereqBanner>` — with a minimal smoke test verifying render branches.
2. **Bug fix + first prereq page:** `getReceivableRoutesWithUnreceivedItems` helper + `getReceivingPrereqs()` + wire `<PagePrerequisites>` into `/store/receiving`. Bug is fixed at this step. Includes unit + Cypress tests for receiving.
3. **Remaining hard-prereq pages:** `/store/transfers`, `/shop/sales`, `/shop/opening-balance`. Each gets its prereq function + wiring + unit tests.
4. **Soft-prereq pages:** `/store`, `/supply`, `/supply/$routeId`, `/shop`. Replace ad-hoc empty states with the new banner pattern.
5. **Setup Checklist page:** `getSystemPrereqs` + `/settings/setup` route + sidebar badge + dashboard banner. Includes Cypress E2E.
6. **Cleanup:** remove unused inline empty-state code in transfers, supply, supply/$routeId.

## Files touched (summary)

**New files:**
- `src/lib/prerequisites/types.ts`
- `src/components/prerequisites/page-prerequisites.tsx`
- `src/components/prerequisites/prereq-empty-state.tsx`
- `src/components/prerequisites/prereq-banner.tsx`
- `src/server/functions/prereqs/receiving.ts`
- `src/server/functions/prereqs/transfers.ts`
- `src/server/functions/prereqs/shop.ts` (covers `/shop`, `/shop/sales`, `/shop/opening-balance`)
- `src/server/functions/prereqs/store.ts`
- `src/server/functions/prereqs/supply.ts` (covers `/supply`, `/supply/$routeId`)
- `src/server/functions/prereqs/system.ts` (`getSystemPrereqs`)
- `src/routes/settings/setup.tsx`
- `src/__tests__/prereqs/*.test.ts`
- `cypress/e2e/setup-checklist.cy.ts` (or similar location based on existing convention)

**Modified files:**
- `src/server/functions/store/receiving.ts` — add `getReceivableRoutesWithUnreceivedItems` helper; update `listReceivableRoutes` to use it
- `src/routes/store/receiving.tsx` — wire prereqs, remove inline empty state
- `src/routes/store/transfers.tsx` — wire prereqs, remove inline "No shops" code
- `src/routes/shop/sales.tsx` — wire prereqs
- `src/routes/shop/opening-balance.tsx` — wire prereqs
- `src/routes/shop/index.tsx` — wire soft prereqs
- `src/routes/store/index.tsx` — wire soft prereqs
- `src/routes/supply/index.tsx` — wire soft prereqs, remove inline supplier banner
- `src/routes/supply/$routeId.tsx` — wire soft prereqs, remove inline supplier banner
- `src/routes/index.tsx` — add dashboard prereq banner
- `src/components/app-sidebar.tsx` — add Settings badge
- Existing Cypress receiving spec (if any) — update for new empty state
