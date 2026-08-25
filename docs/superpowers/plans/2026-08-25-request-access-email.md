# Request Access Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the public request-access form to email requester details to the configured internal recipient.

**Architecture:** Keep the recipient in the server-only `REQUEST_ACCESS_EMAIL` environment variable. A TanStack Start server function validates the form and delegates to a dedicated Resend helper and React Email template; the dialog only receives success/failure and never sees the recipient.

**Tech Stack:** React 19, TanStack Start server functions, Zod, Resend, React Email, Vitest, Testing Library, Cloudflare Wrangler.

---

## File map

- Create `src/server/functions/request-access.ts` for the validated server boundary and testable submission logic.
- Create `src/lib/emails/request-access.tsx` for the internal notification email.
- Modify `src/lib/emails/_layout.tsx` to allow the request template to render structured details inside the existing layout.
- Modify `src/lib/emails/index.ts` to export the new template.
- Modify `src/lib/email.ts` to send to `env.REQUEST_ACCESS_EMAIL` and report delivery failure.
- Modify `src/components/request-access-dialog.tsx` to submit the form and render pending/success/error states.
- Modify `src/__tests__/request-access-dialog.test.tsx` for the browser behavior.
- Create `src/__tests__/request-access.test.ts` for validation and server-to-email wiring.
- Modify `src/__tests__/emails.test.tsx` for rendered email content.
- Modify `src/env.ts`, `.env.example`, `.env.local`, and `.env.test` for the new variable.
- Modify `wrangler.jsonc` only if the deployed Worker configuration requires a committed non-secret fallback; production will be verified and set with Wrangler’s existing secret convention.

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

- [ ] **Step 2: Add server-boundary tests before implementation.**

Mock `#/lib/email` with `sendRequestAccessEmail: vi.fn()`. Import the exported request input schema and test that it accepts trimmed valid fields, rejects a blank name, rejects an invalid email, and rejects a blank message. Test the testable submission function with valid data and assert it calls the email helper with the three requester fields. Make the mock resolve `true` for the success case and `false` for the delivery-failure case; assert the latter rejects with the generic delivery error.

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
- Create: `src/server/functions/request-access.ts`
- Modify: `src/lib/email.ts`
- Create: `src/lib/emails/request-access.tsx`
- Modify: `src/lib/emails/_layout.tsx`
- Modify: `src/lib/emails/index.ts`

- [ ] **Step 1: Add the request input schema and testable submission function.**

In `src/server/functions/request-access.ts`, define:

```ts
export const requestAccessInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email(),
  message: z.string().trim().min(1).max(4000),
})
```

Define `submitRequestAccess(data)` to call `sendRequestAccessEmail(data)`, throw `new Error('Could not send access request')` when it returns `false`, and return `{ ok: true as const }` otherwise. Export `requestAccess = createServerFn().inputValidator(requestAccessInput).handler(({ data }) => submitRequestAccess(data))`.

- [ ] **Step 2: Add the recipient-aware email helper.**

In `src/lib/email.ts`, define the request argument type with `name`, `email`, and `message`. Implement `sendRequestAccessEmail` so it sends from the existing `FROM` address to `env.REQUEST_ACCESS_EMAIL` with subject `New access request — ${name}` and the new template. Return `true` for mock-email mode and successful delivery; catch/log the existing email error format and return `false` for delivery failures. If the Resend result contains an `error`, treat it as a failure instead of reporting success.

- [ ] **Step 3: Build the internal React Email template using the existing layout.**

Extend `EmailLayoutProps` with `children?: ReactNode`, render `children` after the intro and before the CTA, and create `RequestAccessTemplate` that passes the app URL as the CTA target and renders requester name, email, and message in labeled sections. Use React Email components so message text is escaped by rendering rather than interpolating raw HTML. Export the template from `src/lib/emails/index.ts`.

- [ ] **Step 4: Run the server and email tests.**

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
- Inspect/update: `wrangler.jsonc` only if needed by the deployment environment

- [ ] **Step 1: Register the key in runtime validation.**

Add `REQUEST_ACCESS_EMAIL: z.email()` to `server` and map `REQUEST_ACCESS_EMAIL: process.env.REQUEST_ACCESS_EMAIL` in `runtimeEnv` in `src/env.ts`.

- [ ] **Step 2: Set local and test values.**

Add this exact line to `.env.local`, `.env.test`, and the documented `.env.example`:

```dotenv
REQUEST_ACCESS_EMAIL=matovu90@gmail.com
```

Do not print or alter existing API keys.

- [ ] **Step 3: Verify the production Resend prerequisite and set the new production variable.**

Run the read-only check:

```bash
pnpm exec wrangler secret list
```

Confirm `RESEND_API_KEY` exists without printing secret values. Then set the new production value through the existing Wrangler secret convention:

```bash
printf '%s' 'matovu90@gmail.com' | pnpm exec wrangler secret put REQUEST_ACCESS_EMAIL
```

Run `pnpm exec wrangler secret list` again and confirm `REQUEST_ACCESS_EMAIL` is listed. If Wrangler reports an account/project mismatch, stop and report that production could not be changed rather than modifying another Worker.

### Task 5: Verify the complete change

**Files:**
- No new files; review all changed files and preserve unrelated existing working-tree changes.

- [ ] **Step 1: Run focused tests.**

```bash
pnpm test src/__tests__/request-access-dialog.test.tsx src/__tests__/request-access.test.ts src/__tests__/emails.test.tsx
```

Expected: PASS with no request sent to Resend because `.env.test` sets `MOCK_EMAILS=true`.

- [ ] **Step 2: Run typecheck and lint.**

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit 0.

- [ ] **Step 3: Review the diff and environment status.**

```bash
git diff -- src/components/request-access-dialog.tsx src/server/functions/request-access.ts src/lib/email.ts src/lib/emails src/env.ts .env.example wrangler.jsonc
git status --short
```

Confirm no recipient or API key is placed in client code, no existing branding files are reverted, and `REQUEST_ACCESS_EMAIL` is present locally and in the production secret list.

- [ ] **Step 4: Commit the implementation changes.**

Stage only the request-access implementation, tests, env documentation/configuration, and any required template files. Leave the pre-existing changes to `public/favicon.ico`, `public/logo192.png`, `public/logo512.png`, `public/manifest.json`, and `src/__tests__/branding-assets.test.ts` untouched. Commit with:

```bash
git commit -m "feat: enable request access emails"
```
