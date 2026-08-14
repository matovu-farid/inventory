# App-Wide Error Handling Design

## Goal

Give users a consistent, calm recovery experience when an unexpected operation fails, provide polished router-wide 404 and error pages, and preserve Sentry visibility for caught client/server errors.

## Context

This is a TanStack Start application using TanStack Router, Radix UI primitives, Tailwind CSS, and Sentry's TanStack Start and Cloudflare integrations. The root route already owns the application shell and authentication redirect behavior. Route loaders and render failures are handled by TanStack Router, while many event-handler failures are caught locally and rendered as ad-hoc inline messages.

## Design

### Error presentation

Add a reusable `ErrorDialog` component that accepts an unknown error, a title/description override, an open state, and an optional retry callback. It normalizes unknown thrown values to a safe user-facing message, never renders stack traces or server internals, and provides keyboard-accessible dialog semantics through the existing Radix dialog primitives. The default recovery action reloads the current route; callers may provide a more specific retry action.

Add an `ErrorDialogProvider` at the application root. It listens for uncaught browser `error` events and unhandled promise rejections, opens the shared dialog, and lets the user dismiss it or retry. Existing form validation and expected business-rule messages remain local because they are actionable in context; unexpected failures that escape their local handler receive the global dialog.

### Router states

Add a polished `NotFoundPage` for unknown paths and route-level not-found errors. It presents the requested path in a restrained way, offers a link to the dashboard, and remains usable for both authenticated and public routes.

Add a polished `RouteErrorPage` for loader, render, and navigation failures. It uses the same safe error normalization, offers retry via TanStack Router's `reset`, and offers a dashboard recovery link. It does not expose raw error details in production.

In local development only, both the route error page and error dialog include a collapsed diagnostics dropdown. The dropdown exposes the original error message and stack trace with separate copy controls to speed up debugging. The diagnostics component is disabled at build time in production.

Configure these components as the router's `defaultErrorComponent` and `defaultNotFoundComponent`, and set the root route's `errorComponent`/`notFoundComponent` as a defensive fallback for root-render failures.

### Sentry reporting

Keep `instrument.server.mjs`, `src/start.ts`, and the Cloudflare Worker wrapper intact. Add an explicit TanStack Router `defaultOnCatch` callback that reports route errors to Sentry with route error context, while retaining the original error object and React error info. This ensures route-render and loader failures are reported even when a custom UI replaces TanStack Router's generic error component.

The browser Sentry SDK continues to own its global error and rejection instrumentation; the dialog provider only presents those failures and does not report them a second time. Server function failures remain covered by the existing Sentry global function/request middleware and Worker `withSentry` wrapper.

### Testing

Add focused Vitest tests for error normalization, the dialog's safe rendering and recovery controls, the 404 and route-error copy/recovery actions, and the router's Sentry catch callback. Verify the existing Sentry configuration test and run the full typecheck, lint, format check, and production build. Do not add broad refactors to existing local validation UI in this slice.

## Boundaries and non-goals

- Do not replace every existing inline business-rule message with a modal.
- Do not show raw stack traces, database errors, or server implementation details to users.
- Do not add a second Sentry global event reporter that could duplicate browser events.
- Do not modify unrelated image/schema work already present in the worktree.

## Acceptance criteria

1. An uncaught browser error or rejected promise opens the shared error dialog with a safe message and recovery action.
2. An unknown URL renders a designed 404 page with a working dashboard link.
3. A route loader/render failure renders a designed error page with retry and dashboard recovery.
4. Route errors are reported through Sentry's configured client/server pipeline.
5. Existing Worker and TanStack Start Sentry initialization remains present and tests/build/typecheck pass.
6. Local development exposes copyable message and stack diagnostics only after expanding the dropdown; production never renders those diagnostics.
