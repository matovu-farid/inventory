# Supply Route Wizard Back Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small, labeled control above the supply-route wizard title that returns users to the Supply Routes list while preserving the wizard’s existing save-before-exit behavior.

**Architecture:** Update the shared `SupplyRouteWizard` header used by both route-entry flows. The control calls the existing `exitWizard` callback path, which persists dirty route basics and navigates to `/supply`; no new route or server function is needed. Add one focused jsdom component regression test with the router mocked at the boundary.

**Tech Stack:** React 19, TanStack Router, Vitest, Testing Library, lucide-react, Tailwind utility classes.

---

### Task 1: Add the failing shared-wizard regression test

**Files:**
- Create: `src/__tests__/supply-route-wizard.test.tsx`
- Read: `src/components/supply/supply-route-wizard.tsx`

- [ ] **Step 1: Create a minimal route fixture and router spy**

Use the component’s inferred prop type so the test stays aligned with the server-returned route shape. Mock only `useRouter`, returning a `navigate` spy that resolves successfully.

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupplyRouteWizard } from '#/components/supply/supply-route-wizard'

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate }),
}))

afterEach(() => {
  cleanup()
  navigate.mockClear()
})

type RouteFixture = ComponentProps<typeof SupplyRouteWizard>['initialRoute']

const route: RouteFixture = {
  id: 'route-1',
  name: 'Jan 2026',
  status: 'open',
  displayStatus: 'open',
  departureDate: null,
  returnDate: null,
  budgetUsd: null,
  rateUgxPerUsd: null,
  rateRmbPerUsd: null,
  notes: null,
  suppliers: [],
  items: [],
  expenses: [],
}

describe('SupplyRouteWizard back control', () => {
  it('returns to all supply routes from the wizard header', async () => {
    render(
      <SupplyRouteWizard
        initialRoute={route}
        initialCategories={[]}
        initialSuppliers={[]}
        initialStep="basics"
      />,
    )

    const backControl = screen.getByRole('button', {
      name: 'All supply routes',
    })
    fireEvent.click(backControl)

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: '/supply' }),
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify the expected red failure**

Run:

```bash
pnpm vitest run src/__tests__/supply-route-wizard.test.tsx
```

Expected: the test fails because no button named `All supply routes` exists yet. The failure must be a Testing Library query failure, not a module-resolution or fixture error.

### Task 2: Implement the shared wizard back control

**Files:**
- Modify: `src/components/supply/supply-route-wizard.tsx:332-365`

- [ ] **Step 1: Add the header control using the existing exit flow**

Place this before the existing “Supply route entry” paragraph inside the header’s left column. Use the already imported `ArrowLeft` and existing `Button` component; keep it compact and muted while retaining a visible accessible label.

```tsx
<Button
  type="button"
  variant="link"
  size="sm"
  className="mb-2 h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
  onClick={() => void exitWizard()}
>
  <ArrowLeft className="size-4" /> All supply routes
</Button>
```

Do not use a direct `Link`: the existing `exitWizard` function first persists dirty basics, then navigates to `/supply`. Leave the stepper’s internal Back button and Save and exit action unchanged.

- [ ] **Step 2: Run the focused test and verify green**

Run:

```bash
pnpm vitest run src/__tests__/supply-route-wizard.test.tsx
```

Expected: the focused test passes and reports one passing test.

### Task 3: Verify formatting, static checks, and the full test suite

**Files:**
- Verify: `src/components/supply/supply-route-wizard.tsx`
- Verify: `src/__tests__/supply-route-wizard.test.tsx`

- [ ] **Step 1: Run the changed-file formatting check**

Run:

```bash
pnpm exec prettier --check src/components/supply/supply-route-wizard.tsx src/__tests__/supply-route-wizard.test.tsx
```

Expected: Prettier reports both files unchanged and exits 0.

- [ ] **Step 2: Run lint and typecheck**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both commands exit 0 with no lint errors or TypeScript diagnostics.

- [ ] **Step 3: Run the full Vitest suite**

Run:

```bash
pnpm test
```

Expected: the suite exits 0 with zero failed tests.

- [ ] **Step 4: Review the final diff and commit the implementation**

Run:

```bash
git diff --check
git status --short
git diff -- src/components/supply/supply-route-wizard.tsx src/__tests__/supply-route-wizard.test.tsx
git add src/components/supply/supply-route-wizard.tsx src/__tests__/supply-route-wizard.test.tsx
git commit -m "feat: add supply route wizard back button"
```

Expected: the diff contains only the shared header control and its focused regression test, with no unrelated file changes.
