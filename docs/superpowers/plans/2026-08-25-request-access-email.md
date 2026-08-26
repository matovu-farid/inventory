# Request Access Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the public request-access form to email requester details to the configured internal recipient.

**Architecture:** Keep the recipient in the server-only `REQUEST_ACCESS_EMAIL` environment variable. A TanStack Start server function validates the form and delegates to a dedicated Resend helper and React Email template; the dialog only receives success/failure and never sees the recipient.

**Tech Stack:** React 19, TanStack Start server functions, Zod, Resend, React Email, Vitest, Testing Library, Cloudflare Wrangler, `@cloudflare/vitest-pool-workers`.

---

## File map

- Create `src/server/functions/request-access.ts` for the client-safe server-function wrapper.
- Create `src/server/functions/request-access-input.ts` for the client-safe shared Zod input schema.
- Create `src/server/functions/request-access.server.ts` for server-only delivery and abuse protection.
- Create `src/server/runtime-context.ts` for the per-request Worker environment bridge.
- Create `src/server/durable-objects/request-access-rate-limiter.ts` for isolate-independent cooldown state.
- Create `src/lib/emails/request-access.tsx` for the internal notification email.
- Modify `src/lib/emails/_layout.tsx` to allow the request template to render structured details inside the existing layout.
- Modify `src/lib/emails/index.ts` to export the new template.
- Modify `src/lib/email.ts` to send to `env.REQUEST_ACCESS_EMAIL` and report delivery failure.
- Modify `src/components/request-access-dialog.tsx` to submit the form and render pending/success/error states.
- Modify `src/__tests__/request-access-dialog.test.tsx` for the browser behavior.
- Create `src/__tests__/request-access.test.ts` for validation and server-to-email wiring.
- Modify `src/__tests__/emails.test.tsx` for rendered email content.
- Modify `src/env.ts`, `.env.example`, `.env.local`, and `.env.test` for the new variable.
- Modify `.env.test.example` and `.github/workflows/ci.yml` so every generated test/build environment satisfies the required variable and test jobs keep mock email enabled.
- Modify `src/server/worker.ts` to expose the Durable Object class and install the request environment context.
- Modify `wrangler.jsonc` to bind the SQLite-backed rate limiter Durable Object.
- Modify `package.json` and `pnpm-lock.yaml` to pin Wrangler 4.90-compatible migration behavior and add `@cloudflare/vitest-pool-workers`.
- Create `scripts/verify-request-access-ci-env.mjs` for per-job CI configuration checks.
- Create `scripts/verify-request-access-bundle.mjs` for deterministic client/server artifact checks.
- Create `vitest.workers.config.ts` and a Workers-pool integration test for the actual Durable Object runtime.

### Task 1: Add failing tests for the request-access contract

**Files:**
- Modify: `src/__tests__/request-access-dialog.test.tsx`
- Create: `src/__tests__/request-access.test.ts`
- Modify: `src/__tests__/emails.test.tsx`

- [ ] **Step 1: Replace the “coming soon” assertion with the desired browser contract.**

Mock `#/server/functions/request-access` with a `requestAccess` Vitest mock. Render the dialog, fill `Name`, `Email`, and `Message`, submit the form, and assert the mock receives:

```ts
{
  data: {
    name: 'Sara',
    email: 'sara@example.com',
    message: 'We need inventory visibility for our shop.',
  },
}
```

Also assert the submit button is disabled while the promise is pending, then resolves to show a success message. Add a second test where the mock rejects and assert a generic delivery-error message is rendered while the dialog remains open.

- [ ] **Step 2: Add client-safe schema and server-only implementation tests before implementation.**

Import `requestAccessInput` from `#/server/functions/request-access-input` and test that it accepts trimmed valid fields, rejects a blank name, rejects an invalid email, and rejects a blank message. Mock `#/lib/email` and the runtime context, import `submitRequestAccess` only from `#/server/functions/request-access.server`, and assert it calls the email helper with the three requester fields after a successful reservation. Make the mock resolve `true` for the success case and `false` for the delivery-failure case; assert the latter clears the reservation and rejects with the generic delivery error. Keep a separate wrapper test that imports `requestAccess` from `#/server/functions/request-access` and verifies the client-reachable module exposes the validator without importing delivery dependencies.

Add `vitest.workers.config.ts` using the official `@cloudflare/vitest-pool-workers` pool and a test-only Wrangler config that binds the real `RequestAccessRateLimiter` class. Add a Workers-pool integration test that calls the actual Durable Object namespace and verifies first reservation, same-key rejection, expiry, token-owned cleanup, concurrent calls, and the global unknown-key interval. Keep the existing Node Vitest suite for server-function orchestration; the Workers suite is the runtime proof for SQLite, transactions, and schema initialization.

- [ ] **Step 3: Add a failing email-render test.**

Import `RequestAccessTemplate` from `#/lib/emails`, render it with `@react-email/render`, and assert the HTML contains the heading, requester name, requester email, message, and internal app URL.

- [ ] **Step 4: Run the focused tests and confirm they fail for missing behavior.**

Run:

```bash
pnpm test src/__tests__/request-access-dialog.test.tsx src/__tests__/request-access.test.ts src/__tests__/emails.test.tsx
```

Expected: FAIL because the dialog still has no submit behavior, the request-access server module/template do not exist, and the new exports are absent. Fix only test setup errors; do not add production code until the failures are behavior-related.

### Task 2: Implement the validated server and email layers

**Files:**
- Create: `src/server/functions/request-access-input.ts`
- Create: `src/server/functions/request-access.server.ts`
- Modify: `src/server/functions/request-access.ts`
- Modify: `src/lib/email.ts`
- Create: `src/lib/emails/request-access.tsx`
- Modify: `src/lib/emails/_layout.tsx`
- Modify: `src/lib/emails/index.ts`

- [ ] **Step 1: Add the client-safe input schema and wrapper.**

In `src/server/functions/request-access-input.ts`, define:

```ts
export const requestAccessInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  message: z.string().trim().min(1).max(4000),
})
```

In `src/server/functions/request-access.ts`, re-export the schema and define only the `createServerFn` wrapper. Its handler must import the `.server.ts` implementation through the established server-only pattern. The client-reachable module must not import Resend, `src/lib/email.ts`, `process.env`, or the recipient variable.

- [ ] **Step 2: Add the server-only submission implementation.**

In `src/server/functions/request-access.server.ts`, define `submitRequestAccess(data)` to call the email helper, throw `new Error('Could not send access request')` when it returns `false`, and return `{ ok: true as const }` otherwise. Keep this module server-only and import it from the wrapper only in the server function handler.

- [ ] **Step 3: Add the recipient-aware email helper.**

In `src/lib/email.ts`, define the request argument type with `name`, `email`, and `message`. Implement `sendRequestAccessEmail` so it sends from the existing `FROM` address to `env.REQUEST_ACCESS_EMAIL` with subject `New access request — ${name}` and the new template. Return `true` for mock-email mode and successful delivery; catch/log the existing email error format and return `false` for delivery failures. If the Resend result contains an `error`, treat it as a failure instead of reporting success.

- [ ] **Step 4: Build the internal React Email template using the existing layout.**

Extend `EmailLayoutProps` with `children?: ReactNode`, render `children` after the intro and before the CTA, and create `RequestAccessTemplate` that passes the app URL as the CTA target and renders requester name, email, and message in labeled sections. Use React Email components so message text is escaped by rendering rather than interpolating raw HTML. Export the template from `src/lib/emails/index.ts`.

- [ ] **Step 5: Run the server and email tests.**

Run:

```bash
pnpm test src/__tests__/request-access.test.ts src/__tests__/emails.test.tsx
```

Expected: PASS, including validation, helper wiring, delivery-failure handling, and rendered requester details.

### Task 3: Connect the dialog to the server function

**Files:**
- Modify: `src/components/request-access-dialog.tsx`
- Modify: `src/__tests__/request-access-dialog.test.tsx`

- [ ] **Step 1: Add form state and submission handling.**

Import `requestAccess`, track `isSubmitting`, `isSubmitted`, and `error`, and use `FormData` in the submit handler. Convert the three named controls to strings, call `requestAccess({ data: { name, email, message } })`, show the success state on resolution, and show a generic error without closing the dialog on rejection. Reset the form and status when the dialog opens for a new request.

- [ ] **Step 2: Replace the disabled CTA and add accessible feedback.**

Make the button `type="submit"`, remove “coming soon,” disable it while submitting or after success, and render `role="status"` for the success message and `role="alert"` for the error. Add `required` to all three fields. Keep the recipient out of all rendered client text.

- [ ] **Step 3: Run the dialog tests and confirm the green state.**

Run:

```bash
pnpm test src/__tests__/request-access-dialog.test.tsx
```

Expected: PASS for field submission, pending-state duplicate prevention, success feedback, and recoverable failure feedback.

### Task 4: Add local, test, and production environment configuration

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`
- Modify: `.env.local`
- Modify: `.env.test`
- Modify: `.env.test.example`
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/verify-request-access-ci-env.mjs`
- Modify: `wrangler.jsonc`
- Modify: `src/server/worker.ts`
- Create: `src/server/runtime-context.ts`
- Create: `src/server/durable-objects/request-access-rate-limiter.ts`

- [ ] **Step 1: Register the key in runtime validation.**

Add `REQUEST_ACCESS_EMAIL: z.email()` to `server` and map `REQUEST_ACCESS_EMAIL: process.env.REQUEST_ACCESS_EMAIL` in `runtimeEnv` in `src/env.ts`.

- [ ] **Step 2: Set local, test, CI, and documented values.**

Add this exact line to `.env.local`, `.env.test`, `.env.test.example`, `.env.example`, and every CI-generated test/build environment:

```dotenv
REQUEST_ACCESS_EMAIL=matovu90@gmail.com
```

Do not print or alter existing API keys.

- [ ] **Step 3: Verify the production target before any secret mutation.**

Confirm from `wrangler.jsonc` that the target Worker is `tanstack-start-app` and the configured custom-domain route is `inventory.fidexa.org`. Run `pnpm exec wrangler whoami` and `pnpm exec wrangler secret list` to verify the authenticated account and existing `RESEND_API_KEY`; do not print secret values. If Wrangler reports an account/project mismatch, stop and report that production could not be changed rather than modifying another Worker.

- [ ] **Step 4: Add isolate-independent cooldown state.**

Create a SQLite-backed `RequestAccessRateLimiter` Durable Object. Use one fixed object name for this low-volume public endpoint so rotating IPs cannot create unbounded objects; the object maintains a per-client cooldown and a global minimum interval. Set production constants to a 60-second per-client cooldown and a 5-second global interval. Its `reserve(key, now)` method must run in `ctx.storage.transactionSync`, use a primary-key client column plus a single global-admission row, and return an opaque reservation token only when both the client and global windows are available. Its `clear(token)` method must atomically release the exact client reservation and roll back the global-admission row only when its token still owns that row; repeated or unknown clears are no-ops. This makes concurrent calls serialize and makes false/throwing delivery cleanup unable to clear another request’s reservation. Initialize only the schema in `blockConcurrencyWhile`, use parameterized SQL, and make clear idempotent. Use Wrangler 4.90’s supported legacy migration model: add `durable_objects.bindings` with `name: REQUEST_ACCESS_RATE_LIMITER` and `class_name: RequestAccessRateLimiter`, plus `migrations: [{ tag: "request-access-rate-limiter-v1", new_sqlite_classes: ["RequestAccessRateLimiter"] }]`; do not use the unsupported top-level `exports` property. Export the class from the Worker entry and bridge the request `env` through `AsyncLocalStorage` so server functions can access the binding without importing Worker globals.

- [ ] **Step 5: Wire trusted client identity and reservation cleanup.**

Derive the abuse key only from `CF-Connecting-IP`; if it is absent, use `unknown` and ignore all client-supplied forwarding headers. Reserve before sending and pass the returned token to cleanup. On a false return or thrown delivery error, attempt `clear(token)` before rethrowing the generic error; if clear itself fails, log only a fixed operational event and preserve the original delivery error. Return a generic cooldown error without exposing internal keys or recipient details. Cover the trusted header, absent-header global throttling, expiry replacement, same-key concurrency, helper false, helper throw, token ownership, and clear failure with focused tests/mocks. Add `pnpm exec wrangler deploy --dry-run` to validate the binding, migration, and generated Worker export before any live deploy.

### Task 5: Adversarial production hardening

**Files:**
- Modify: `src/components/request-access-dialog.tsx`
- Modify: `src/lib/email.ts`
- Modify: `src/__tests__/request-access.test.ts`
- Modify: `src/__tests__/request-access-dialog.test.tsx`
- Modify: `src/__tests__/request-access-email.test.ts`
- Create/modify: `src/__tests__/request-access-rate-limiter.test.ts`

- [ ] **Step 1: Close client validation gaps.**

Reject empty/whitespace-only email and malformed email before calling the server, trim all three submitted fields, and add tests proving no server call occurs for either invalid case.

- [ ] **Step 2: Remove requester PII from mock logs.**

For request-access mock mode, log only a fixed event such as `[Email:mock] request-access`; do not include requester name, email, message, or recipient. Preserve existing behavior for unrelated email helpers and assert the request-access log contents directly.

- [ ] **Step 3: Verify the server-only graph and generated bundle.**

Build with `pnpm build`, then run `node scripts/verify-request-access-bundle.mjs`. The script must fail on any public/client match for `Resend`, `RESEND_API_KEY`, `REQUEST_ACCESS_EMAIL`, `matovu90@gmail.com`, `process.env`, or `request-access.server`; it must locate the generated server manifest and assert the server route and `REQUEST_ACCESS_RATE_LIMITER` binding are present. It must use explicit exit codes and print the checked artifact paths. Do not use a generic repository-wide scan that can match source or test fixtures.

- [ ] **Step 4: Run an independent spec and quality review.**

Review all new files as well as the diff, not only modified tracked files. Specifically verify that `withWorkerEnv(env, handler.fetch(...))` scopes each request, `getWorkerEnv()` throws outside a request, rejected requests clean up the context, and concurrent/nested contexts cannot cross-read bindings. Do not claim completion while any critical or important finding remains open.

### Task 6: Verify the complete change

**Files:**
- No new files; review all changed files and preserve unrelated existing working-tree changes.

- [ ] **Step 1: Run focused tests.**

```bash
pnpm test src/__tests__/request-access-dialog.test.tsx src/__tests__/request-access.test.ts src/__tests__/emails.test.tsx src/__tests__/request-access-email.test.ts src/__tests__/request-access-rate-limiter.test.ts
```

Expected: PASS with no request sent to Resend because `.env.test` sets `MOCK_EMAILS=true`.

Run `pnpm exec vitest run --config vitest.workers.config.ts src/__tests__/request-access-rate-limiter.integration.test.ts` and require the real Workers-pool Durable Object tests to pass.
CI must run this same command in a separate Workers integration job after `pnpm install --frozen-lockfile`; the job must use the committed test-only Wrangler config and must not depend on PostgreSQL or live Resend credentials.

- [ ] **Step 2: Run typecheck and lint.**

```bash
pnpm typecheck
pnpm lint
pnpm exec prettier --check src/components/request-access-dialog.tsx src/server/functions/request-access.ts src/server/functions/request-access-input.ts src/server/functions/request-access.server.ts src/server/runtime-context.ts src/server/durable-objects/request-access-rate-limiter.ts src/server/worker.ts src/lib/email.ts src/lib/emails/_layout.tsx src/lib/emails/index.ts src/lib/emails/request-access.tsx src/env.ts src/__tests__/request-access.test.ts src/__tests__/request-access-dialog.test.tsx src/__tests__/request-access-email.test.ts src/__tests__/request-access-rate-limiter.test.ts src/__tests__/request-access-rate-limiter.integration.test.ts scripts/verify-request-access-ci-env.mjs scripts/verify-request-access-bundle.mjs vitest.workers.config.ts package.json wrangler.jsonc
git diff --check
```

Expected: all commands exit 0; unrelated pre-existing formatting failures are reported separately.

- [ ] **Step 3: Set and verify the production recipient secret.**

Only after the target checks in Task 4, set the new value with `printf '%s' 'matovu90@gmail.com' | pnpm exec wrangler secret put REQUEST_ACCESS_EMAIL`. Run `pnpm exec wrangler secret list` again and confirm `REQUEST_ACCESS_EMAIL` is present; never print values.

- [ ] **Step 4: Review the diff and environment status.**

```bash
git diff -- src/components/request-access-dialog.tsx src/server/functions src/server/runtime-context.ts src/server/durable-objects src/server/worker.ts src/lib/email.ts src/lib/emails src/env.ts src/__tests__/request-access.test.ts src/__tests__/request-access-dialog.test.tsx src/__tests__/request-access-email.test.ts src/__tests__/request-access-rate-limiter.test.ts src/__tests__/request-access-rate-limiter.integration.test.ts .env.example .env.test.example .github/workflows/ci.yml scripts/verify-request-access-ci-env.mjs scripts/verify-request-access-bundle.mjs vitest.workers.config.ts package.json pnpm-lock.yaml wrangler.jsonc
git status --short
```

Confirm no recipient or API key is placed in client code, no existing branding files are reverted, the Durable Object binding is present in the committed Worker config, and `REQUEST_ACCESS_EMAIL` is present locally and in the production secret list. Verify the production secret target is Worker `tanstack-start-app` and the configured route is `inventory.fidexa.org` before any deployment command.

- [ ] **Step 5: Verify CI environment coverage.**

Run `node scripts/verify-request-access-ci-env.mjs`. The script must parse the workflow text and fail unless each test/e2e/build/deploy job’s generated environment contains `REQUEST_ACCESS_EMAIL`, and test/e2e jobs contain `MOCK_EMAILS=true`; the check must identify jobs individually rather than only counting repository-wide matches. If a job is intentionally different, document the reason in the workflow rather than silently omitting the variable. Secrets such as `RESEND_API_KEY` must remain secret-backed and must never be committed.

- [ ] **Step 6: Deploy the binding and verify the production runtime.**

After the build and config checks pass, run `pnpm exec wrangler deploy` against the verified Worker target so the Durable Object binding is live. Run `pnpm exec wrangler secret list` afterward. Do not send a live request-access email as a smoke test: the Workers-pool integration suite exercises the real DO state machine, and the bundle/config checks prove the generated Worker references the binding. If deployment requires new account authority, stop and report the exact approval needed.

- [ ] **Step 7: Commit the implementation changes.**

Stage only the request-access implementation, tests, env documentation/configuration, and any required template files. Leave the pre-existing changes to `public/favicon.ico`, `public/logo192.png`, `public/logo512.png`, and `src/__tests__/branding-assets.test.ts` untouched. Commit with:

```bash
git commit -m "feat: enable request access emails"
```
