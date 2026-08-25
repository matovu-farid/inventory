# Request Access Email Design

## Goal

When a visitor submits the landing-page “Request access” form, send the submitted
name, email address, and message to the configured internal recipient. The
recipient must be configurable without changing client code and must not be
exposed to the browser.

## Approach

Use a dedicated TanStack Start server function and a dedicated React Email
template. This follows the project’s existing server-function and Resend
patterns while keeping input validation and the recipient on the server.

The recipient is configured as `REQUEST_ACCESS_EMAIL`, with
`matovu90@gmail.com` in local development and production. It is a server-only
key in `src/env.ts`; it is not prefixed with `VITE_` and is never returned by a
server function.

## Components and data flow

1. `RequestAccessDialog` controls the form state and sends the three fields to
   the server function on submit.
2. `src/server/functions/request-access.ts` validates a non-empty name and
   message plus a valid email address, then calls the email layer.
3. `src/lib/email.ts` adds `sendRequestAccessEmail`, which sends a dedicated
   subject and React Email template to `env.REQUEST_ACCESS_EMAIL`.
4. `src/lib/emails/request-access.tsx` renders the requester’s details and
   message using the existing email layout.

The browser receives only a success or failure result. The form shows a
submitting state, disables duplicate submissions, closes or resets after a
successful request according to the existing dialog interaction, and displays a
recoverable error when delivery fails.

## Error handling and security

- Validate all fields server-side even though the form also uses browser input
  types and required fields.
- Preserve the requester’s email as submitted data in the email body, not as a
  dynamic recipient, to avoid allowing arbitrary external recipients.
- Use the existing email helper’s mock-email behavior in tests.
- Do not log the message or recipient unnecessarily. Delivery errors follow the
  existing email helper behavior and surface a generic failure to the form.

## Environment configuration

- Add `REQUEST_ACCESS_EMAIL=matovu90@gmail.com` to `.env.local`.
- Document the key in `.env.example` and provide it in `.env.test` so env
  validation and tests are deterministic.
- Add the production value to the Cloudflare Worker configuration using the
  project’s existing Wrangler environment-variable convention. The value is
  non-secret configuration, but remains server-side because it controls an
  internal workflow.

## Testing

- Update the dialog test to cover submit behavior, disabled/loading state, and
  success/error feedback.
- Add server-function/email-layer coverage for validation and the configured
  recipient, mocking the email transport at the existing boundary.
- Run the focused Vitest tests, then the project typecheck and lint checks.

## Scope

This change does not persist requests in the database, create user accounts, or
send confirmation emails to requesters. Administrators continue to invite users
through the existing flow.
