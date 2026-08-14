# App-Wide Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable global error dialog, polished router-wide 404/error states, and explicit Sentry reporting for route errors without disturbing existing business-rule messages or Worker instrumentation.

**Architecture:** Keep error presentation in focused UI components. Normalize unknown thrown values in a small pure helper, use a root-mounted provider only for uncaught browser events, and configure TanStack Router defaults for route errors/not-found states. Use the router's `defaultOnCatch` to report route errors to the already configured Sentry SDK.

**Tech Stack:** TanStack Start, TanStack Router, React 19, Radix UI dialog primitives, Tailwind CSS v4, Vitest, Testing Library, Sentry TanStack Start SDK.

---

## Files and responsibilities

- Create `src/lib/error-handling.ts`: pure safe error normalization and route-error reporting callback factory.
- Create `src/components/error-dialog.tsx`: reusable controlled dialog with retry/reload recovery.
- Create `src/components/error-dialog-provider.tsx`: root provider that translates uncaught browser errors/rejections into dialog state.
- Create `src/components/error-details.tsx`: development-only collapsed message/stack dropdown with copy actions.
- Create `src/components/error-pages.tsx`: `NotFoundPage` and `RouteErrorPage` route fallback UI.
- Modify `src/router.tsx`: install the default error/not-found components and Sentry `defaultOnCatch`.
- Modify `src/routes/__root.tsx`: keep not-found matches out of the auth redirect, set root defensive fallbacks, and mount the dialog provider.
- Create `src/__tests__/error-handling.test.ts`: pure normalization and Sentry callback tests.
- Create `src/__tests__/error-dialog.test.tsx`: dialog and provider interaction tests.
- Create `src/__tests__/error-pages.test.tsx`: 404/error page recovery tests.
- Create `src/__tests__/error-details.test.tsx`: development gating and clipboard behavior tests.
- Preserve `instrument.server.mjs`, `src/start.ts`, `src/server/worker.ts`, and unrelated dirty worktree files.

### Task 1: Add failing pure error-handling tests

**Files:**
- Create: `src/__tests__/error-handling.test.ts`
- Create: `src/lib/error-handling.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  getSafeErrorMessage,
  createRouteErrorReporter,
} from '#/lib/error-handling'

describe('getSafeErrorMessage', () => {
  it('uses the fallback for unknown and raw thrown values', () => {
    expect(getSafeErrorMessage({ message: 'database password=secret' })).toBe(
      'Something went wrong. Please try again.',
    )
    expect(getSafeErrorMessage('network failure')).toBe(
      'Something went wrong. Please try again.',
    )
  })

  it('allows an explicitly supplied safe message', () => {
    expect(getSafeErrorMessage(new Error('internal detail'), 'Could not save this item.')).toBe(
      'Could not save this item.',
    )
  })
})

describe('createRouteErrorReporter', () => {
  it('reports the original error with route context and React error info', () => {
    const captureException = vi.fn()
    const reporter = createRouteErrorReporter(captureException)
    const error = new Error('route failed')
    const errorInfo = { componentStack: '\n    at BrokenRoute' }

    reporter(error, errorInfo)

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(error, {
      contexts: { react: errorInfo },
    })
  })
})
```

- [ ] **Step 2: Run the focused test and verify the expected RED failure**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts`

Expected: FAIL because `src/lib/error-handling.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal pure helper**

Implement `getSafeErrorMessage(error, safeMessage = DEFAULT_ERROR_MESSAGE)` so it always returns the supplied safe message and never reads a thrown value's `.message`. Implement `createRouteErrorReporter(captureException)` to call the injected function with the original error and `{ contexts: { react: errorInfo } }`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts`

Expected: PASS with all tests green.

### Task 2: Add the reusable error dialog and root event provider

**Files:**
- Create: `src/components/error-dialog.tsx`
- Create: `src/components/error-dialog-provider.tsx`
- Create: `src/__tests__/error-dialog.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorDialog } from '#/components/error-dialog'
import { ErrorDialogProvider } from '#/components/error-dialog-provider'

afterEach(cleanup)

describe('ErrorDialog', () => {
  it('shows safe copy and calls retry', () => {
    const onRetry = vi.fn()
    render(<ErrorDialog open error={new Error('secret')} onOpenChange={() => {}} onRetry={onRetry} />)

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('ErrorDialogProvider', () => {
  it('opens for an uncaught error and can be dismissed', () => {
    render(
      <ErrorDialogProvider>
        <div>Application</div>
      </ErrorDialogProvider>,
    )

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('secret') }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run src/__tests__/error-dialog.test.tsx`

Expected: FAIL because the dialog and provider files do not exist.

- [ ] **Step 3: Implement the minimal dialog**

Use the existing `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, and `Button` components. Render a destructive icon, the title `Something went wrong`, a safe description from `getSafeErrorMessage`, a `Try again` button when `onRetry` exists, and a close button. Call `onRetry` before closing so callers can reset state/reload.

- [ ] **Step 4: Implement the provider**

Create a context-free provider with local state. Register `window` `error` and `unhandledrejection` listeners inside `useEffect`; each listener stores the thrown value and opens the dialog. Cleanup both listeners on unmount. The retry handler calls `window.location.reload()` and the close handler clears state. Render children plus one dialog instance.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `pnpm vitest run src/__tests__/error-dialog.test.tsx`

Expected: PASS with all tests green.

### Task 3: Add polished router error and 404 pages

**Files:**
- Create: `src/components/error-pages.tsx`
- Create: `src/__tests__/error-pages.test.tsx`

- [ ] **Step 1: Write failing page tests**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotFoundPage, RouteErrorPage } from '#/components/error-pages'

afterEach(cleanup)

describe('NotFoundPage', () => {
  it('offers a dashboard recovery link without exposing implementation details', () => {
    render(<NotFoundPage />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
  })
})

describe('RouteErrorPage', () => {
  it('retries through the route boundary and offers dashboard recovery', () => {
    const reset = vi.fn()
    render(<RouteErrorPage error={new Error('secret')} reset={reset} />)
    expect(screen.getByRole('heading', { name: 'We hit a snag' })).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/')
  })
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run src/__tests__/error-pages.test.tsx`

Expected: FAIL because the page components do not exist.

- [ ] **Step 3: Implement the page components**

Build a centered responsive card with the existing logo, lucide icon, muted explanatory copy, `Button`/`Link` recovery controls, and a restrained error identifier only if one is explicitly supplied. Keep copy generic and do not render `error.message`. `RouteErrorPage` accepts TanStack Router's `{ error, reset }` props; `NotFoundPage` accepts the router not-found props but does not depend on them.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm vitest run src/__tests__/error-pages.test.tsx`

Expected: PASS with all tests green.

### Task 4: Add development-only copyable diagnostics

**Files:**
- Create: `src/components/error-details.tsx`
- Create: `src/__tests__/error-details.test.tsx`
- Modify: `src/components/error-dialog.tsx`
- Modify: `src/components/error-pages.tsx`
- Modify: `src/lib/error-handling.ts`

- [ ] **Step 1: Write the failing diagnostics tests**

Test `getErrorDiagnostics(error, true)` for the original message/stack, `getErrorDiagnostics(error, false)` for `null`, and `getErrorDiagnostics(undefined, true)` for a string fallback. Render `ErrorDetails` with development enabled, assert the message and stack are hidden until the `Show error details` trigger is clicked, then mock `navigator.clipboard.writeText` and assert separate `Copy message` and `Copy stack` clicks copy the exact values. Render with `development={false}` and assert no diagnostics trigger or raw text is present.

- [ ] **Step 2: Run the focused diagnostics tests and verify RED**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts src/__tests__/error-details.test.tsx`

Expected: FAIL because `getErrorDiagnostics` and `ErrorDetails` do not exist.

- [ ] **Step 3: Implement the development-only diagnostics**

Use `import.meta.env.DEV` as the default gate. Return the original `Error.message` and `Error.stack` only when the gate is true. Render a closed Radix `Collapsible` with separate copy buttons using `navigator.clipboard.writeText` inside a `try/catch`; do not render the component in production. Mount it under the error dialog description and beneath the route error recovery controls.

- [ ] **Step 4: Run diagnostics and all focused error tests**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts src/__tests__/error-details.test.tsx src/__tests__/error-dialog.test.tsx src/__tests__/error-pages.test.tsx`

Expected: PASS with all focused error tests green.

### Task 5: Wire router defaults, Sentry reporting, root auth behavior, and provider

**Files:**
- Modify: `src/router.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/__tests__/error-handling.test.ts`

- [ ] **Step 1: Add the router configuration test first**

Extend `src/__tests__/error-handling.test.ts` with a unit-level assertion around `createRouteErrorReporter`; keep the Sentry module injected so this test does not initialize or contact Sentry. The integration assertions should check the source contains the default component and `defaultOnCatch` wiring only if direct router construction is impractical because of generated route dependencies.

- [ ] **Step 2: Run the test and confirm RED for missing router wiring**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts`

Expected: the new wiring assertion fails because `getRouter()` has no error defaults or catch reporter.

- [ ] **Step 3: Configure `getRouter()`**

Import the error pages and Sentry, then add:

```ts
defaultErrorComponent: RouteErrorPage,
defaultNotFoundComponent: NotFoundPage,
defaultOnCatch: createRouteErrorReporter((error, errorInfo) => {
  Sentry.withScope((scope) => {
    scope.setContext('react', {
      componentStack: errorInfo.componentStack,
    })
    Sentry.captureException(error)
  })
}),
```

Keep the existing route tree, query context, preload settings, and SSR query integration unchanged.

- [ ] **Step 4: Configure the root route and preserve unauthenticated 404s**

Set `errorComponent: RouteErrorPage` and `notFoundComponent: NotFoundPage` on the root route. In `RootLayout`, derive `isNotFoundPage = matches.some((match) => match.status === 'notFound')` and exclude it from both auth redirects. This lets an unknown URL render the 404 page instead of returning `null` or redirecting to `/login`. Keep public route behavior and sales-role `/pos` redirect unchanged.

- [ ] **Step 5: Mount the provider in the root document**

Wrap the root document body children with `ErrorDialogProvider` inside `TooltipProvider`, preserving the existing `Scripts` placement and server-safe markup.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts src/__tests__/error-dialog.test.tsx src/__tests__/error-pages.test.tsx`

Expected: PASS with all focused tests green.

### Task 6: Adversarial review loop and full verification

**Files:**
- Review: all files changed by Tasks 1–5

- [ ] **Step 1: Run the adversarial checklist**

Check the diff for these failure modes:

1. Raw `error.message`, stack, database text, tokens, or URLs can reach rendered user copy.
2. Development diagnostics render in production or are expanded by default.
3. A route error is reported twice by both `defaultOnCatch` and a new global listener.
4. A not-found match is redirected to login or hidden by `RootLayout`.
5. `ErrorDialogProvider` accesses `window` during SSR or leaks event listeners after unmount.
6. Retry is absent, non-keyboard accessible, or invokes a stale callback.
7. Sentry initialization files or Worker wrapping were removed or changed accidentally.
8. Existing dirty image/schema changes are included in the implementation diff.
9. TypeScript imports create a client-only dependency in server-only code.

- [ ] **Step 2: Fix every finding and rerun focused tests**

Run: `pnpm vitest run src/__tests__/error-handling.test.ts src/__tests__/error-dialog.test.tsx src/__tests__/error-pages.test.tsx`

Expected: PASS with zero focused failures.

- [ ] **Step 3: Run full verification**

Run: `pnpm test`

Expected: Vitest exits 0 with zero failed tests.

Run: `pnpm typecheck`

Expected: TypeScript exits 0 with no diagnostics.

Run: `pnpm lint`

Expected: ESLint exits 0 with no warnings or errors.

Run: `pnpm format`

Expected: Prettier exits 0 with no formatting differences.

Run: `pnpm build`

Expected: Vite/TanStack Start production build exits 0 and emits the server artifact.

- [ ] **Step 4: Perform the final adversarial review**

Re-read the acceptance criteria against the final diff and verification output. If any criterion lacks direct evidence, continue working rather than claiming completion.
