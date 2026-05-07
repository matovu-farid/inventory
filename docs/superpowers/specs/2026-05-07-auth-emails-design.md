# Auth Emails: Verification, Password Reset, Admin Invite

**Date:** 2026-05-07
**Status:** Approved
**Owner:** Inventory team

## Goal

Wire three email-driven auth flows into the Inventory app:

1. **Email verification** — strict (sign-in blocked until verified) for self-signups
2. **Password reset** — self-service forgot/reset
3. **Admin invite** — admins create a user; invitee sets their own password and is signed in

All three use Resend with branded React Email + Tailwind templates, sent from `noreply@fidexa.org`. The login page becomes invite-only after the first admin self-signs up.

## Why

The app currently allows anyone to sign up with any email and immediately sign in, with no path to recover a lost password and no admin-controlled onboarding. Before this rolls out beyond the bootstrap admin, we need:

- Verified emails so we can trust the address for resets
- A reset path so a forgotten password is not an admin support ticket
- Invite-only onboarding so admins control who joins

## Non-goals

- Magic-link sign-in
- 2FA, passkeys, or any non-password authenticator
- Welcome email after verification
- Custom token lifetimes for verification/reset — better-auth defaults (1 hour) are fine
- Branded sender domains beyond `noreply@fidexa.org`
- Localised email copy (English only)

## High-level design

Better-auth already implements verification and password-reset endpoints, token generation, hashing, single-use semantics, and expiry. For verification and reset we plug into its hooks. For invite, we layer a small custom flow on top of the better-auth admin plugin and reuse the existing `verification` table for the one-time invite token.

### Three flows at a glance

| Flow | Trigger | Token store | Token TTL | After click | Outcome |
|------|---------|-------------|-----------|-------------|---------|
| Verify | New signup | better-auth (default) | 1h | `/api/auth/verify-email` | Auto sign-in, redirect `/` |
| Reset | User on `/forgot-password` | better-auth (default) | 1h | `/reset-password` | Set password, redirect `/login` (success banner) |
| Invite | Admin on `/settings/users` | `verification` table, identifier `invite:{userId}` | 7d | `/accept-invite` | Set password, server-side sign-in, redirect `/` |

### Login page becomes invite-only after bootstrap

The existing `databaseHooks.user.create.before` already grants admin role to the first user. We extend it to **reject signup attempts when any user already exists**. The `/login` route loader returns `usersExist: boolean`:

- `usersExist === false` → show a one-time "Create the first admin account" signup form
- `usersExist === true` → show login-only form, no signup toggle. Footer text: "Need access? Ask your administrator for an invite."

## Components

### `src/lib/email.ts` (new)

Single Resend client + three helpers, all fire-and-log (never throw):

```ts
sendVerificationEmail({ to, name, url }): Promise<void>
sendPasswordResetEmail({ to, name, url }): Promise<void>
sendInviteEmail({ to, name, inviterName, url }): Promise<void>
```

Reads `RESEND_API_KEY`, `EMAIL_FROM` (default `Inventory Management <noreply@fidexa.org>`), and `APP_URL` from `env.ts`.

### `src/lib/emails/` (new directory)

React Email templates using `<Tailwind>` from `@react-email/components`:

- `verify-email.tsx` — `VerifyEmailTemplate({ name, url })`
- `reset-password.tsx` — `ResetPasswordTemplate({ name, url })`
- `invite-user.tsx` — `InviteUserTemplate({ name, inviterName, url })`
- `index.ts` — re-exports

**Shared visual structure**

- Body: `bg-slate-50`, system font stack
- Container: centered, max 560px
- Header card: blue gradient `from-[#4DA6FF] to-[#0066E6]` (matches the in-app `Logo`), 48×48 logo PNG (`<Img src="${APP_URL}/logo192.png" alt="Inventory Management">`) on the left, "Inventory Management" wordmark in white on the right
- Body card: white, rounded, soft shadow — heading, greeting (`Hi ${name},`), one-paragraph intro, primary CTA (`bg-[#0066E6]`), expiry/warning note, fallback "or paste this URL" with a `<Link>`
- Footer: muted "If you didn't request this…" line + copyright

**Per-template copy**

- **Verify:** heading "Verify your email", paragraph "Thanks for creating your Inventory Management account — confirm your email to finish signing in.", CTA "Verify email", note "This link expires in 1 hour."
- **Reset:** heading "Reset your password", paragraph "We got a request to reset the password for your Inventory Management account. Click below to choose a new one.", CTA "Reset password", warning "If you didn't request this, ignore this email — your password won't change."
- **Invite:** heading "You're invited to Inventory Management", paragraph "${inviterName} invited you to join the Inventory Management workspace. Click below to set your password and sign in.", CTA "Set password & sign in", note "This invite expires in 7 days." Footer adapts to "If you weren't expecting this invitation, you can safely ignore this email."

### `src/lib/auth.ts` (edit)

Add to the existing `betterAuth({ ... })` config:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  sendResetPassword: async ({ user, url }) =>
    sendPasswordResetEmail({ to: user.email, name: user.name, url }),
},
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url }) =>
    sendVerificationEmail({ to: user.email, name: user.name, url }),
},
```

Extend `databaseHooks.user.create.before` to reject signups after the first user:

```ts
before: async (userData) => {
  const result = await db.select({ count: sql<number>`count(*)` }).from(schema.user)
  const userCount = Number(result[0].count)
  if (userCount === 0) {
    return { data: { ...userData, role: "admin" } }
  }
  // Block self-signups once an admin exists. Admin invite flow goes through the
  // admin plugin, which bypasses this hook.
  throw new Error("Sign-up is disabled. Ask your administrator for an invite.")
}
```

### `src/lib/invite.ts` (new)

Two server-side helpers built on better-auth primitives:

- `createInvite({ userId }): Promise<{ token: string; expiresAt: Date }>` — generates a cryptographically random token, stores a row in better-auth's existing `verification` table with `identifier = "invite:" + userId` and a 7-day expiry, returns the raw token.
- `consumeInvite(token): Promise<{ userId: string } | null>` — looks up the row, checks expiry, deletes the row on success (atomic), returns the userId.

Reuses the existing `verification` table — no schema migration needed. Token storage details (raw vs hashed value column) pinned in plan.

### `src/env.ts` (edit)

Add to the `server` schema:

- `RESEND_API_KEY: z.string().min(1)` (required)
- `EMAIL_FROM: z.string().min(1).optional()` (default applied in `email.ts`)
- `APP_URL: z.string().url()` (required — used both as the email link base and the logo src)

### Routes (new)

- **`src/routes/forgot-password.tsx`** — single email field. Calls the better-auth client's "forgot password" method with `redirectTo: '${APP_URL}/reset-password'`. Always shows the same generic success message regardless of whether the email exists, to prevent enumeration.
- **`src/routes/reset-password.tsx`** — reads `?token=` from the URL. Form with new-password + confirm fields. Calls the better-auth client reset method. On success, redirects to `/login?reset=success`. On invalid/expired token, inline error with link back to `/forgot-password`.
- **`src/routes/verify-email-sent.tsx`** — reads `?email=` from URL. Shows "We sent a verification link to **email**. Check your inbox." plus a "Resend email" button that calls the better-auth client's "send verification email" method.
- **`src/routes/accept-invite.tsx`** — reads `?token=` from the URL.
  - Loader: validates token via a peek operation (no consume). If invalid/expired, render "This invite is no longer valid; ask your administrator for a new one." with no form.
  - On valid token: render set-password form (new password + confirm).
  - Submit calls server function `acceptInvite({ token, password })` which:
    1. Re-validates and consumes the token atomically
    2. Sets the user's password via better-auth's admin plugin (`auth.api.setUserPassword({ userId, newPassword })` — exact API name pinned in plan)
    3. Calls `auth.api.signInEmail({ body: { email, password }, asResponse: true })` to mint a session
    4. Returns the response with `Set-Cookie` headers passed through to the browser
  - On success → redirect to `/`. On any failure → reload `/accept-invite?error=…` with friendly inline message.
- **`src/routes/settings/users.tsx`** — admin-only users management page.
  - Loader: lists users via better-auth admin API.
  - Renders a table (existing `Table` ui components) with columns: name, email, role, shop, status (verified / unverified / invited).
  - "Invite user" button opens a dialog: email, name, role (admin/sales/etc.), optional shop. Submit calls server function `inviteUser({ email, name, role, shopId })`.
  - Per-row actions (admin only): "Resend invite" (regenerates token + re-emails), "Remove user". Out of scope: edit role, ban, change password.

### Routes (edit)

- **`src/routes/login.tsx`**
  - Loader returns `{ usersExist: boolean }` via a server function querying user count.
  - When `usersExist === false`: show a "Create first admin account" signup-only form. No mode toggle. After submit → redirect to `/verify-email-sent?email=…`.
  - When `usersExist === true`: show login-only form. Footer reads "Need access? Ask your administrator for an invite." Add a "Forgot password?" link.
  - When sign-in fails with the better-auth "email not verified" error: redirect to `/verify-email-sent?email=…`.
  - When loaded with `?error=verification_failed`: render an inline error and a "Resend verification email" prompt.
  - When loaded with `?reset=success`: render an inline success banner.

### Server functions (new under `src/server/functions/admin/users.ts`)

- `inviteUser({ email, name, role, shopId? })` — admin-guarded.
  1. `auth.api.createUser({ body: { email, password: <random>, name, role, data: { shopId } } })` with `emailVerified: true` (admin vouches; invitee doesn't need to re-verify).
  2. `createInvite({ userId })` → returns `{ token, expiresAt }`.
  3. Look up the inviting admin's name from session.
  4. `sendInviteEmail({ to: email, name, inviterName, url: '${APP_URL}/accept-invite?token=${token}' })`.
  5. Return `{ ok: true }`. Email-send failures are logged but not surfaced — admins can hit "Resend invite".
- `resendInvite({ userId })` — admin-guarded. Reuses `createInvite` (rotates token) + `sendInviteEmail`.
- `acceptInvite({ token, password })` — public (token-guarded). See `/accept-invite` route description above.
- `removeUser({ userId })` — admin-guarded. Wraps better-auth admin remove.
- `listUsers()` — admin-guarded. Wraps better-auth admin list, joins shop names if present.

> Exact better-auth client and admin API method names (`authClient.forgetPassword` vs `requestPasswordReset`, `auth.api.createUser` vs `auth.api.adminCreateUser`, etc.) are pinned during writing-plans against the installed better-auth version, not in this spec.

## Data flow

### Sign-up (first admin only)

```
User on /login (usersExist === false) submits email/password
  → authClient.signUp.email()
  → before-hook grants role: "admin", count = 0
  → emailVerification.sendOnSignUp triggers sendVerificationEmail
  → requireEmailVerification: true → no session
  → login page navigates to /verify-email-sent?email=...
```

### Sign-up rejection (after bootstrap)

```
Anyone POSTs to /api/auth/sign-up/email (form not visible in UI)
  → before-hook throws "Sign-up is disabled..."
  → API returns 4xx
  → defensive: even if a stale UI shows the form, the request fails server-side
```

### Verify

```
User clicks email link → /api/auth/verify-email?token=...
  → better-auth verifies, autoSignInAfterVerification establishes session
  → redirect to /
On invalid/expired token → redirect /login?error=verification_failed
```

### Sign-in (existing unverified user)

```
authClient.signIn.email() → email-not-verified error
  → login page navigates to /verify-email-sent?email=...
```

### Forgot / reset password

```
/forgot-password submit → authClient forgot-password method (redirectTo set)
  → better-auth (silently, only if user exists) calls sendResetPassword
  → UI shows generic success regardless

User clicks email link → /reset-password?token=...
  → user enters new password + confirm
  → authClient reset method
  → on success: redirect to /login?reset=success
  → on failure: inline error + link to /forgot-password
```

### Admin invite

```
Admin on /settings/users clicks "Invite user", fills form, submits
  → server fn inviteUser():
       auth.api.createUser({ ..., emailVerified: true })
       createInvite({ userId }) → token (stored in verification table)
       sendInviteEmail({ ..., url: ${APP_URL}/accept-invite?token=... })
  → admin sees new row with status "invited"

Invitee clicks email link → /accept-invite?token=...
  → loader: peek-validate token (no consume)
  → invitee enters password + confirm, submits
  → server fn acceptInvite({ token, password }):
       consumeInvite(token) → userId (atomic delete)
       auth.api.setUserPassword({ userId, newPassword: password })
       auth.api.signInEmail({ body: { email, password }, asResponse: true })
       pass through Set-Cookie headers
  → redirect to /
On invalid/expired token → friendly empty state, "ask your administrator for a new invite"
```

## Error handling

- **Resend failure** (network, 5xx, invalid key): caught in `email.ts`, logged via `console.error`. The triggering flow still completes server-side; the user can retry via "Resend email" / admin can hit "Resend invite".
- **Invalid / expired token** (verify, reset, invite): user-facing friendly message + a way back (resend prompt or link to forgot/admin).
- **Email enumeration**: `/forgot-password` always shows generic success. Login does not distinguish "exists but unverified" from "does not exist" at the public surface — only sign-ins that succeed credentially-but-fail-due-to-unverified flow into the verification-sent UX path; missing accounts get the standard "invalid email or password" message.
- **Env misconfiguration**: `RESEND_API_KEY` and `APP_URL` are validated at boot via `@t3-oss/env-core`. Missing or malformed values fail fast at startup, not on first email send.
- **Race on accept-invite**: `consumeInvite` does an atomic delete-and-return so two concurrent acceptances cannot both succeed.

## Authorization

- All routes under `/settings/users` and the user-management server functions require `role === "admin"`. Anyone else gets a 403 / redirect to `/`.
- `acceptInvite` is publicly callable but token-guarded (single-use, expires).
- `inviteUser` records the inviter from session, never trusts a client-supplied inviterName.

## Testing

- **Vitest unit** (`src/lib/emails/*.test.tsx`): render each template with a sample payload using `@react-email/render`, snapshot the HTML, assert the CTA `href` matches the input URL and the expiry/warning copy is present.
- **Vitest integration**:
  - Mock the `Resend` client. Drive `auth.api.signUpEmail` and assert `sendVerificationEmail` was called with a URL whose origin matches `APP_URL`. Drive `auth.api.requestPasswordReset` likewise.
  - Drive `inviteUser → acceptInvite` end-to-end against a real test DB; assert: invite row created in `verification`, after accept the row is gone, the user has the new password set (sign-in succeeds), and a session cookie is returned.
  - Drive a second `acceptInvite` with the same token; assert it fails (single-use).
  - Expire the row manually; assert `acceptInvite` rejects.
  - Attempt signup when `userCount > 0`; assert `before` hook rejects.
- **Cypress E2E** (`cypress/e2e/auth-email.cy.ts`):
  - Bootstrap state: signup → assert redirect to `/verify-email-sent` with email visible.
  - `/forgot-password` submit → assert generic success message regardless of whether email exists.
  - Admin user-management: invite a user, assert table updates with "invited" status, assert "Resend invite" works.
  - Token-link follow-through (verify, reset, accept-invite) is covered by integration tests; not E2E (no mailbox stub).

## Dependencies to add

- `resend` (pin to the version in `../money-lending`)
- `@react-email/components` (pin to the version in `../money-lending`)

## Env additions

Append to `.env.local` and document in a new `.env.example`:

```
RESEND_API_KEY=re_iP478PDt_GLuXQ1YgQaV5hooQitwaRZKy
EMAIL_FROM="Inventory Management <noreply@fidexa.org>"
APP_URL=http://localhost:3000
```

Production `APP_URL`: `https://inventory.fidexa.org`.

## Out of scope (will not be built)

- Magic-link / passkey / 2FA flows
- Welcome email after verification
- Per-user verification expiry overrides
- Admin "force resend verification" UI for self-signups (admins can use "Remove user" + reinvite)
- Edit-role, ban, change-password admin actions in the users page (separate feature)
- Localisation of email copy
