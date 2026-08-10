# Supply Route Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the final Supply Route wizard action visibly confirm the saved route and return the user to the Supply Routes list.

**Architecture:** Keep the existing route persistence and intermediate “Save and exit” behavior unchanged. Add a dedicated finalization handler for “Finish route” that navigates to `/supply` with a validated `completedRoute` search parameter; the list page resolves that ID from its already-loaded routes and renders a status card for the just-saved route. If the ID is missing or stale, the list remains fully usable without showing a false success message.

**Tech Stack:** TanStack Router search validation, React route components, existing Supply Route Wizard, Cypress E2E tests, Vitest/typecheck/Prettier.

---

### Task 1: Add the failing completion-flow regression test

**Files:**
- Modify: `cypress/e2e/15-guided-supply-route.cy.ts`

- [ ] **Step 1: Extend the existing route-resume test after it reopens the route entry.**

From the reopened Items step, click the Review step, verify the review heading, click the final `Finish route` button, and assert that the browser returns to `/supply` with a visible `Supply route saved` message containing the seeded route name.

```ts
cy.contains('button', 'Review').click()
cy.contains('Review route entry').should('be.visible')
cy.contains('button', 'Finish route').click()
cy.location('pathname').should('eq', '/supply')
cy.contains('Supply route saved').should('be.visible')
cy.contains('Guided Test Route').should('be.visible')
```

- [ ] **Step 2: Run the focused spec to verify the new assertion fails for the current implementation.**

Run:

```bash
pnpm exec cypress run --spec cypress/e2e/15-guided-supply-route.cy.ts
```

Expected: the existing flow reaches route detail after `Finish route`, so the `/supply` assertion fails. If the local Cloudflare-backed dev server is unavailable, record that limitation and use the prior CI failure plus static checks as the red evidence.

### Task 2: Add validated completion state to the Supply Routes list

**Files:**
- Modify: `src/routes/supply/index.tsx`

- [ ] **Step 1: Add a search schema for the completion route ID.**

Import `z` and add `validateSearch: z.object({ completedRoute: z.uuid().optional() })` to the `/supply/` route definition. Read `completedRoute` with `Route.useSearch()` in `SupplyRoutesPage`.

- [ ] **Step 2: Resolve the ID against loaded route data.**

Find the matching route in `routes`. Render the confirmation only when a matching route exists; never display success for an unknown ID.

- [ ] **Step 3: Render an accessible confirmation card above the existing list.**

Use the existing Card/Button/Link primitives. The card must include:

```tsx
<div role="status" aria-live="polite">
  <p>Supply route saved</p>
  <p>{completed.name} is open and ready to continue.</p>
  <p>{completed.items.length} item rows saved.</p>
</div>
```

Include a link to reopen the matching route at `/supply/$routeId/entry`; leave the existing table and its open-route links unchanged.

### Task 3: Route only the final Finish action to the list

**Files:**
- Modify: `src/components/supply/supply-route-wizard.tsx`

- [ ] **Step 1: Add a separate `finishRoute` handler.**

Reuse `persistBasics()` and return early if it fails. On success, navigate to `/supply` with `{ completedRoute: route.id }` in the search object.

```ts
async function finishRoute() {
  if (!(await persistBasics())) return
  await router.navigate({
    to: '/supply',
    search: { completedRoute: route.id },
  })
}
```

- [ ] **Step 2: Change only the final button to call `finishRoute`.**

Keep the “Save and exit” button calling `exitWizard()`, so users who pause before finishing still return to the route detail and can resume later.

### Task 4: Verify and adversarially review the implementation

**Files:**
- Review: `src/routes/supply/index.tsx`
- Review: `src/components/supply/supply-route-wizard.tsx`
- Review: `cypress/e2e/15-guided-supply-route.cy.ts`

- [ ] **Step 1: Run focused static checks.**

```bash
pnpm exec prettier --check src/routes/supply/index.tsx src/components/supply/supply-route-wizard.tsx cypress/e2e/15-guided-supply-route.cy.ts
pnpm exec tsc --noEmit
git diff --check
```

- [ ] **Step 2: Run the focused Cypress spec in the configured E2E environment.**

```bash
pnpm exec cypress run --spec cypress/e2e/15-guided-supply-route.cy.ts
```

Expected: both tests in the spec pass, including the new confirmation-and-return assertion.

- [ ] **Step 3: Perform the adversarial review.**

Check each of these explicitly:

1. “Save and exit” still navigates to the route detail, not the list.
2. “Finish route” cannot navigate if route basics fail to persist.
3. A stale or malformed `completedRoute` query does not show a false success card.
4. The saved route remains open and appears in the list with its existing Continue setup link.
5. The success card does not replace or hide the route table.
6. The new search state is typed and does not introduce a server or database change.

- [ ] **Step 4: Run the full available verification suite before claiming completion.**

```bash
pnpm exec prettier --check .
pnpm exec tsc --noEmit
pnpm test
```

Report any pre-existing full-suite failures separately from failures caused by this change.
