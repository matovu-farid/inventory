# Auth Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire email verification, password reset, and admin-invite flows into the Inventory app, using better-auth + Resend with branded React Email + Tailwind templates. Login becomes invite-only after the bootstrap admin self-signs up.

**Architecture:** Better-auth handles tokens/expiry/single-use for verification and reset via its built-in hooks; we plug in three Resend-backed send functions. Admin invites layer a small custom flow on top of the better-auth admin plugin, reusing the existing `verification` table for one-time invite tokens. UI lives in three new TanStack Start routes plus a `/settings/users` admin page.

**Tech Stack:** TanStack Start, better-auth 1.5.x (admin plugin), drizzle, Resend 6.9.x, @react-email/components 1.0.x, Vitest, Cypress, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-05-07-auth-emails-design.md`

---

## File Structure

**Created:**
- `src/lib/email.ts` — Resend client + three send helpers (fire-and-log)
- `src/lib/emails/index.ts` — barrel
- `src/lib/emails/_layout.tsx` — shared header/footer/styles for all templates
- `src/lib/emails/verify-email.tsx`
- `src/lib/emails/reset-password.tsx`
- `src/lib/emails/invite-user.tsx`
- `src/lib/invite.ts` — `createInvite`, `consumeInvite`, `peekInvite`
- `src/server/functions/admin/users.ts` — `inviteUser`, `resendInvite`, `acceptInvite`, `removeUser`, `listUsers`
- `src/server/functions/auth/users-exist.ts` — `usersExist` server fn (drives `/login` loader)
- `src/routes/forgot-password.tsx`
- `src/routes/reset-password.tsx`
- `src/routes/verify-email-sent.tsx`
- `src/routes/accept-invite.tsx`
- `src/routes/settings/users.tsx`
- `src/__tests__/emails.test.tsx`
- `src/__tests__/invite.test.ts`
- `cypress/e2e/07-auth-emails.cy.ts`
- `.env.example`

**Modified:**
- `package.json` — add `resend`, `@react-email/components`
- `src/env.ts` — add `RESEND_API_KEY`, `EMAIL_FROM?`, `APP_URL`
- `src/lib/auth.ts` — add `emailVerification` config, `sendResetPassword`, harden `databaseHooks`
- `src/routes/login.tsx` — bootstrap-only signup, "Forgot password?" link, error/reset banners
- `vitest.config.ts` — include `*.test.tsx`

---

## Task 1: Install dependencies, add env vars, create `.env.example`

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Modify: `src/env.ts`
- Modify: `.env.local` (manual — instructions only)

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add resend@^6.9.4 @react-email/components@^1.0.10
```

Expected: both packages added under `dependencies` in `package.json`.

- [ ] **Step 2: Extend env validation**

Edit `src/env.ts` so `server` includes the new keys. Replace the existing `server` block:

```ts
server: {
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url().optional(),
  ELECTRIC_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().optional(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1).optional(),
  APP_URL: z.string().url(),
},
```

- [ ] **Step 3: Create `.env.example`**

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/inventory
BETTER_AUTH_SECRET=replace-me-32-chars-minimum
BETTER_AUTH_URL=http://localhost:3000
APP_URL=http://localhost:3000

RESEND_API_KEY=re_replace_me
EMAIL_FROM="Inventory Management <noreply@fidexa.org>"
```

- [ ] **Step 4: Append the new keys to `.env.local`**

Tell the user to add the following lines to their `.env.local` (do not commit values):

```
RESEND_API_KEY=re_iP478PDt_GLuXQ1YgQaV5hooQitwaRZKy
EMAIL_FROM="Inventory Management <noreply@fidexa.org>"
APP_URL=http://localhost:3000
```

- [ ] **Step 5: Sanity-check the build**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS (no type errors from the env change).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/env.ts .env.example
git commit -m "Add resend + react-email deps and email env vars"
```

---

## Task 2: Build the shared email layout component

**Files:**
- Create: `src/lib/emails/_layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"

export type EmailLayoutProps = {
  preview: string
  appUrl: string
  heading: string
  greeting?: string
  intro: string
  ctaLabel: string
  ctaUrl: string
  note?: string
  noteTone?: "info" | "warning"
  footer?: string
}

export function EmailLayout({
  preview,
  appUrl,
  heading,
  greeting,
  intro,
  ctaLabel,
  ctaUrl,
  note,
  noteTone = "info",
  footer = "If you did not request this, you can safely ignore this email.",
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans m-0 p-0">
          <Container className="max-w-[560px] mx-auto py-6">
            <Section className="bg-gradient-to-br from-[#4DA6FF] to-[#0066E6] rounded-t-xl px-8 py-5">
              <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                <tr>
                  <td width="48" valign="middle">
                    <Img
                      src={`${appUrl}/logo192.png`}
                      width="48"
                      height="48"
                      alt="Inventory Management"
                      className="rounded-[12px] block"
                    />
                  </td>
                  <td valign="middle" style={{ paddingLeft: "16px" }}>
                    <Text className="text-white text-[18px] font-bold m-0 tracking-[-0.3px]">
                      Inventory Management
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            <Section className="bg-white px-8 pt-8 pb-6 rounded-b-xl shadow-sm">
              <Heading className="text-slate-900 text-[24px] font-bold mb-4 mt-0 tracking-[-0.3px]">
                {heading}
              </Heading>
              {greeting && (
                <Text className="text-slate-700 text-[15px] leading-6 mb-2 mt-0">
                  {greeting}
                </Text>
              )}
              <Text className="text-slate-600 text-[15px] leading-6 mb-6 mt-0">
                {intro}
              </Text>

              <Section className="text-center mb-6">
                <Button
                  href={ctaUrl}
                  className="bg-[#0066E6] text-white text-[15px] font-semibold rounded-md px-8 py-3 no-underline inline-block"
                >
                  {ctaLabel}
                </Button>
              </Section>

              {note && (
                <Text
                  className={
                    noteTone === "warning"
                      ? "text-amber-600 text-[13px] font-medium mb-4 mt-0"
                      : "text-slate-500 text-[13px] mb-4 mt-0"
                  }
                >
                  {note}
                </Text>
              )}

              <Text className="text-slate-400 text-[12px] leading-5 mb-1 mt-0">
                Or copy and paste this URL into your browser:
              </Text>
              <Link
                href={ctaUrl}
                className="text-[#0066E6] text-[12px] break-all"
              >
                {ctaUrl}
              </Link>
            </Section>

            <Hr className="border-slate-200 my-0" />

            <Text className="text-slate-400 text-[12px] leading-5 text-center pt-4 px-8 m-0">
              {footer}
            </Text>
            <Text className="text-slate-300 text-[11px] text-center pt-2 px-8 m-0">
              © {new Date().getFullYear()} Inventory Management
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/emails/_layout.tsx
git commit -m "Add shared email layout for transactional emails"
```

---

## Task 3: Build the three email templates + barrel

**Files:**
- Create: `src/lib/emails/verify-email.tsx`
- Create: `src/lib/emails/reset-password.tsx`
- Create: `src/lib/emails/invite-user.tsx`
- Create: `src/lib/emails/index.ts`

- [ ] **Step 1: `verify-email.tsx`**

```tsx
import { EmailLayout } from "./_layout"

export type VerifyEmailProps = {
  name: string
  url: string
  appUrl: string
}

export function VerifyEmailTemplate({ name, url, appUrl }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview="Verify your email for Inventory Management"
      appUrl={appUrl}
      heading="Verify your email"
      greeting={`Hi ${name},`}
      intro="Thanks for creating your Inventory Management account — confirm your email to finish signing in."
      ctaLabel="Verify email"
      ctaUrl={url}
      note="This link expires in 1 hour."
    />
  )
}

export default VerifyEmailTemplate
```

- [ ] **Step 2: `reset-password.tsx`**

```tsx
import { EmailLayout } from "./_layout"

export type ResetPasswordProps = {
  name: string
  url: string
  appUrl: string
}

export function ResetPasswordTemplate({ name, url, appUrl }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview="Reset your Inventory Management password"
      appUrl={appUrl}
      heading="Reset your password"
      greeting={`Hi ${name},`}
      intro="We got a request to reset the password for your Inventory Management account. Click below to choose a new one."
      ctaLabel="Reset password"
      ctaUrl={url}
      note="If you didn't request this, ignore this email — your password won't change."
      noteTone="warning"
    />
  )
}

export default ResetPasswordTemplate
```

- [ ] **Step 3: `invite-user.tsx`**

```tsx
import { EmailLayout } from "./_layout"

export type InviteUserProps = {
  name: string
  inviterName: string
  url: string
  appUrl: string
}

export function InviteUserTemplate({
  name,
  inviterName,
  url,
  appUrl,
}: InviteUserProps) {
  return (
    <EmailLayout
      preview="You're invited to Inventory Management"
      appUrl={appUrl}
      heading="You're invited to Inventory Management"
      greeting={`Hi ${name},`}
      intro={`${inviterName} invited you to join the Inventory Management workspace. Click below to set your password and sign in.`}
      ctaLabel="Set password & sign in"
      ctaUrl={url}
      note="This invite expires in 7 days."
      footer="If you weren't expecting this invitation, you can safely ignore this email."
    />
  )
}

export default InviteUserTemplate
```

- [ ] **Step 4: `index.ts`**

```ts
export { VerifyEmailTemplate } from "./verify-email"
export type { VerifyEmailProps } from "./verify-email"
export { ResetPasswordTemplate } from "./reset-password"
export type { ResetPasswordProps } from "./reset-password"
export { InviteUserTemplate } from "./invite-user"
export type { InviteUserProps } from "./invite-user"
```

- [ ] **Step 5: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/emails/
git commit -m "Add verify/reset/invite email templates"
```

---

## Task 4: Test the email templates render correctly

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/__tests__/emails.test.tsx`

- [ ] **Step 1: Allow vitest to pick up `.tsx` tests**

Edit `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "#": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
  },
})
```

- [ ] **Step 2: Write tests**

```tsx
import { render } from "@react-email/render"
import { describe, it, expect } from "vitest"
import {
  VerifyEmailTemplate,
  ResetPasswordTemplate,
  InviteUserTemplate,
} from "#/lib/emails"

const APP_URL = "https://inventory.fidexa.org"

describe("VerifyEmailTemplate", () => {
  it("includes the verify URL on the CTA and as plain text", async () => {
    const url = `${APP_URL}/api/auth/verify-email?token=abc`
    const html = await render(
      <VerifyEmailTemplate name="Sara" url={url} appUrl={APP_URL} />,
    )
    expect(html).toContain("Verify email")
    expect(html).toContain(url)
    expect(html).toContain("Hi Sara,")
    expect(html).toContain("expires in 1 hour")
  })
})

describe("ResetPasswordTemplate", () => {
  it("includes the reset URL and the warning copy", async () => {
    const url = `${APP_URL}/reset-password?token=xyz`
    const html = await render(
      <ResetPasswordTemplate name="Sara" url={url} appUrl={APP_URL} />,
    )
    expect(html).toContain("Reset password")
    expect(html).toContain(url)
    expect(html).toContain("won't change")
  })
})

describe("InviteUserTemplate", () => {
  it("includes the inviter name and 7-day expiry", async () => {
    const url = `${APP_URL}/accept-invite?token=tok`
    const html = await render(
      <InviteUserTemplate
        name="Sara"
        inviterName="Admin Alice"
        url={url}
        appUrl={APP_URL}
      />,
    )
    expect(html).toContain("Admin Alice invited you")
    expect(html).toContain(url)
    expect(html).toContain("Set password &amp; sign in")
    expect(html).toContain("expires in 7 days")
  })
})
```

- [ ] **Step 3: Run tests**

Run: `pnpm test src/__tests__/emails.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts src/__tests__/emails.test.tsx
git commit -m "Add render tests for email templates"
```

---

## Task 5: Build the Resend send module

**Files:**
- Create: `src/lib/email.ts`

- [ ] **Step 1: Write the module**

```ts
import { Resend } from "resend"
import { env } from "#/env"
import {
  VerifyEmailTemplate,
  ResetPasswordTemplate,
  InviteUserTemplate,
} from "#/lib/emails"

const resend = new Resend(env.RESEND_API_KEY)

const FROM = env.EMAIL_FROM ?? "Inventory Management <noreply@fidexa.org>"
const APP_URL = env.APP_URL

type VerifyArgs = { to: string; name: string; url: string }
type ResetArgs = { to: string; name: string; url: string }
type InviteArgs = {
  to: string
  name: string
  inviterName: string
  url: string
}

export async function sendVerificationEmail({ to, name, url }: VerifyArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Verify your email — Inventory Management",
      react: VerifyEmailTemplate({ name, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error("[Email] sendVerificationEmail failed:", error)
  }
}

export async function sendPasswordResetEmail({ to, name, url }: ResetArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Reset your password — Inventory Management",
      react: ResetPasswordTemplate({ name, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error("[Email] sendPasswordResetEmail failed:", error)
  }
}

export async function sendInviteEmail({
  to,
  name,
  inviterName,
  url,
}: InviteArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${inviterName} invited you to Inventory Management`,
      react: InviteUserTemplate({ name, inviterName, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error("[Email] sendInviteEmail failed:", error)
  }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "Add Resend send helpers for verify/reset/invite emails"
```

---

## Task 6: Wire better-auth to the email helpers + harden signup

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Update auth config**

Replace the file contents with:

```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import * as schema from "#/db/schema"
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "#/lib/email"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://tanstack-start-app.faridmato90.workers.dev",
    "https://inventory.fidexa.org",
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name ?? user.email,
        url,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({
        to: user.email,
        name: user.name ?? user.email,
        url,
      })
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "sales",
        input: true,
      },
      shopId: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (userData, ctx) => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.user)
          const userCount = Number(result[0].count)

          // Bootstrap: first user becomes admin
          if (userCount === 0) {
            return { data: { ...userData, role: "admin" } }
          }

          // Allow admin-created users (admin plugin path) — these arrive
          // with an active admin session in the request context
          const headers = ctx?.context?.request?.headers
          if (headers) {
            try {
              const session = await auth.api.getSession({ headers })
              const role = (session?.user as { role?: string } | undefined)
                ?.role
              if (role === "admin") {
                if (!userData.role || userData.role === "user") {
                  return { data: { ...userData, role: "sales" } }
                }
                return { data: userData }
              }
            } catch {
              // fall through to rejection
            }
          }

          // Block self-signup once an admin exists
          throw new Error(
            "Sign-up is disabled. Ask your administrator for an invite.",
          )
        },
      },
    },
  },
  plugins: [tanstackStartCookies(), admin()],
})

export type Session = typeof auth.$Infer.Session
```

> **Note:** the exact shape of `ctx.context.request.headers` may differ between better-auth minor versions. If the type errors out, log the `ctx` parameter once during local dev to find the headers path. The semantic intent is: get the current request session and check `role === "admin"`.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS. If `ctx` typing fails, narrow with `as any` only on that line and add a `// TODO: refine ctx type once api stabilises` comment.

- [ ] **Step 3: Manual sanity (no test yet)**

Run: `pnpm dev`
Expected: server starts without errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth.ts
git commit -m "Require email verification and lock signup to bootstrap + admins"
```

---

## Task 7: Add `usersExist` server function

**Files:**
- Create: `src/server/functions/auth/users-exist.ts`

- [ ] **Step 1: Write it**

```ts
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import { user } from "#/db/schema"

export const usersExist = createServerFn().handler(async () => {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(user)
  return Number(row.count) > 0
})
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/functions/auth/users-exist.ts
git commit -m "Add usersExist server function for login bootstrap detection"
```

---

## Task 8: Update `/login` — bootstrap-only signup, error/reset banners

**Files:**
- Modify: `src/routes/login.tsx`

- [ ] **Step 1: Replace file contents**

```tsx
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { authClient } from "#/lib/auth-client"
import { usersExist } from "#/server/functions/auth/users-exist"

const searchSchema = z.object({
  error: z.enum(["verification_failed"]).optional(),
  reset: z.enum(["success"]).optional(),
})

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  loader: async () => {
    const exists = await usersExist()
    return { usersExist: exists }
  },
  component: LoginPage,
})

function LoginPage() {
  const { usersExist: exists } = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()

  // Bootstrap only allows the first user (signup). After that, login only.
  const showSignup = !exists
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setPending(true)

    try {
      if (showSignup) {
        const result = await authClient.signUp.email({ name, email, password })
        if (result.error) {
          setError(result.error.message ?? "Sign-up failed")
          setPending(false)
          return
        }
        router.navigate({
          to: "/verify-email-sent",
          search: { email },
        })
        return
      }

      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        const code = (result.error as { code?: string }).code
        if (
          code === "EMAIL_NOT_VERIFIED" ||
          /verif/i.test(result.error.message ?? "")
        ) {
          router.navigate({
            to: "/verify-email-sent",
            search: { email },
          })
          return
        }
        setError(result.error.message ?? "Invalid email or password")
        setPending(false)
        return
      }
      router.navigate({ to: "/" })
    } catch {
      setError(showSignup ? "Sign-up failed." : "Login failed.")
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em] text-foreground">
            {showSignup ? "Create the first admin account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {showSignup
              ? "Set up the first user for Inventory Management"
              : "Sign in to Inventory Management"}
          </p>
        </div>

        <div
          className="rounded-2xl bg-white p-6"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {search.reset === "success" && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-700">
                Password updated. Sign in with your new password.
              </div>
            )}
            {search.error === "verification_failed" && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
                Verification link is invalid or expired. Sign in to request a new one.
              </div>
            )}
            {error && (
              <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
                {error}
              </div>
            )}

            {showSignup && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-[13px]">
                  Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="h-10 rounded-xl"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10 rounded-xl"
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[13px]">
                  Password
                </Label>
                {!showSignup && (
                  <Link
                    to="/forgot-password"
                    className="text-[12px] font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 rounded-xl"
                required
              />
            </div>

            <Button
              type="submit"
              className="h-10 w-full rounded-xl text-[13px] font-semibold"
              disabled={pending}
            >
              {pending
                ? showSignup
                  ? "Creating account..."
                  : "Signing in..."
                : showSignup
                  ? "Create Account"
                  : "Sign In"}
            </Button>
          </form>
        </div>

        {!showSignup && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Need access? Ask your administrator for an invite.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + run**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

Run: `pnpm dev` and visit `/login`. With at least one user in the DB, the form should be login-only with "Forgot password?" visible.

- [ ] **Step 3: Commit**

```bash
git add src/routes/login.tsx
git commit -m "Bootstrap-only signup on /login + forgot-password link"
```

---

## Task 9: Build `/verify-email-sent`

**Files:**
- Create: `src/routes/verify-email-sent.tsx`

- [ ] **Step 1: Write it**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { authClient } from "#/lib/auth-client"

export const Route = createFileRoute("/verify-email-sent")({
  validateSearch: z.object({ email: z.string().email() }),
  component: VerifyEmailSentPage,
})

function VerifyEmailSentPage() {
  const { email } = Route.useSearch()
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  )

  async function handleResend() {
    setStatus("sending")
    const result = await authClient.sendVerificationEmail({ email })
    if (result.error) {
      setStatus("error")
      return
    }
    setStatus("sent")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[440px] px-6 text-center">
        <Logo className="mx-auto size-12 shadow-md" />
        <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
          Check your inbox
        </h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          We sent a verification link to <strong>{email}</strong>. Click the
          link in that email to finish signing in.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-6 text-left" style={{ boxShadow: "var(--shadow-lg)" }}>
          <p className="text-[13px] text-muted-foreground mb-3">
            Didn't get it? Check your spam folder, or resend the email below.
          </p>
          <Button
            type="button"
            onClick={handleResend}
            disabled={status === "sending" || status === "sent"}
            className="h-10 w-full rounded-xl text-[13px] font-semibold"
          >
            {status === "sending"
              ? "Sending..."
              : status === "sent"
                ? "Sent — check your inbox"
                : "Resend verification email"}
          </Button>
          {status === "error" && (
            <p className="mt-3 text-[12px] text-destructive">
              Could not resend right now. Try again in a moment.
            </p>
          )}
        </div>

        <p className="mt-6 text-[13px]">
          <Link to="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/verify-email-sent.tsx
git commit -m "Add /verify-email-sent route with resend"
```

---

## Task 10: Build `/forgot-password`

**Files:**
- Create: `src/routes/forgot-password.tsx`

- [ ] **Step 1: Write it**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { authClient } from "#/lib/auth-client"
import { env } from "#/env"

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    // Always show generic success — never disclose whether the email exists.
    await authClient.forgetPassword({
      email,
      redirectTo: `${env.APP_URL}/reset-password`,
    })
    setSubmitted(true)
    setPending(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
            Reset your password
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            We'll email you a link to choose a new one
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
          {submitted ? (
            <div className="text-center">
              <p className="text-[14px] text-foreground">
                If an account exists for that email, we've sent reset instructions.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px]">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-10 rounded-xl"
                  required
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full rounded-xl text-[13px] font-semibold"
                disabled={pending}
              >
                {pending ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
        </div>

        {!submitted && (
          <p className="mt-6 text-center text-[13px] text-muted-foreground">
            Remembered it?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
```

> If `env` cannot be safely imported into a client component, replace `env.APP_URL` with `window.location.origin` and add a `useEffect` guard so SSR does not break.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/forgot-password.tsx
git commit -m "Add /forgot-password route"
```

---

## Task 11: Build `/reset-password`

**Files:**
- Create: `src/routes/reset-password.tsx`

- [ ] **Step 1: Write it**

```tsx
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { authClient } from "#/lib/auth-client"

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({
    token: z.string().optional(),
    error: z.enum(["INVALID_TOKEN"]).optional(),
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token, error: searchError } = Route.useSearch()
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  const tokenInvalid = !token || searchError === "INVALID_TOKEN"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setPending(true)
    const result = await authClient.resetPassword({
      newPassword: password,
      token: token!,
    })
    if (result.error) {
      setError(result.error.message ?? "Could not reset password.")
      setPending(false)
      return
    }
    router.navigate({ to: "/login", search: { reset: "success" } })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[400px] px-6">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="size-12 shadow-md" />
          <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
            Choose a new password
          </h1>
        </div>

        <div className="rounded-2xl bg-white p-6" style={{ boxShadow: "var(--shadow-lg)" }}>
          {tokenInvalid ? (
            <div className="text-center">
              <p className="text-[14px] text-destructive">
                This reset link is invalid or has expired.
              </p>
              <Link
                to="/forgot-password"
                className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px]">
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 rounded-xl"
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-[13px]">
                  Confirm password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="h-10 rounded-xl"
                  required
                  minLength={8}
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full rounded-xl text-[13px] font-semibold"
                disabled={pending}
              >
                {pending ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/reset-password.tsx
git commit -m "Add /reset-password route"
```

---

## Task 12: Test the auth.ts wiring (signup-block + email send hook)

**Files:**
- Create: `src/__tests__/auth-emails.test.ts`

This is an integration test — it requires `DATABASE_URL` pointing at a test DB. If the project does not have a separate test DB convention, run against `.env.local` and clean up rows.

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "#/db"
import { user } from "#/db/schema"
import { auth } from "#/lib/auth"

vi.mock("#/lib/email", async () => {
  return {
    sendVerificationEmail: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
    sendInviteEmail: vi.fn(async () => undefined),
  }
})

import * as emailMod from "#/lib/email"

const TEST_PREFIX = "test-auth-emails-"

async function cleanup() {
  await db.execute(
    `DELETE FROM "user" WHERE email LIKE '${TEST_PREFIX}%'`,
  )
}

describe("auth emails wiring", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("first signup succeeds and triggers verification email", async () => {
    const email = `${TEST_PREFIX}first-${Date.now()}@example.com`
    await auth.api.signUpEmail({
      body: { email, password: "password123", name: "First Admin" },
    })

    const rows = await db
      .select()
      .from(user)
      .where(/* drizzle eq … pin in implementation */ undefined as any)
    // Simplified: confirm the user landed in the DB via raw query
    const found = await db.execute(
      `SELECT id, role FROM "user" WHERE email = '${email}'`,
    )
    expect((found as any).rows[0].role).toBe("admin")
    expect(emailMod.sendVerificationEmail).toHaveBeenCalledOnce()
  })

  it("second signup is rejected", async () => {
    const a = `${TEST_PREFIX}a-${Date.now()}@example.com`
    const b = `${TEST_PREFIX}b-${Date.now()}@example.com`
    await auth.api.signUpEmail({
      body: { email: a, password: "password123", name: "A" },
    })

    await expect(
      auth.api.signUpEmail({
        body: { email: b, password: "password123", name: "B" },
      }),
    ).rejects.toThrow(/disabled/i)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm dotenv -e .env.local -- vitest run src/__tests__/auth-emails.test.ts`
Expected: PASS (2 tests).

If types choke on the drizzle `eq` snippet, drop it and rely on the raw `db.execute` query as shown.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/auth-emails.test.ts
git commit -m "Test signup-block hook + verification email send"
```

---

## Task 13: Build the invite token module

**Files:**
- Create: `src/lib/invite.ts`

- [ ] **Step 1: Write it**

```ts
import { randomBytes } from "node:crypto"
import { and, eq, gt } from "drizzle-orm"
import { db } from "#/db"
import { verification } from "#/db/schema"

const INVITE_PREFIX = "invite:"
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function makeToken(): string {
  return randomBytes(32).toString("base64url")
}

export async function createInvite({
  userId,
}: {
  userId: string
}): Promise<{ token: string; expiresAt: Date }> {
  const token = makeToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)

  // Drop any existing invite rows for this user (rotate)
  await db
    .delete(verification)
    .where(eq(verification.identifier, INVITE_PREFIX + userId))

  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: INVITE_PREFIX + userId,
    value: token,
    expiresAt,
  })
  return { token, expiresAt }
}

export async function peekInvite(
  token: string,
): Promise<{ userId: string } | null> {
  const now = new Date()
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.value, token), gt(verification.expiresAt, now)))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  if (!row.identifier.startsWith(INVITE_PREFIX)) return null
  return { userId: row.identifier.slice(INVITE_PREFIX.length) }
}

export async function consumeInvite(
  token: string,
): Promise<{ userId: string } | null> {
  const now = new Date()
  const deleted = await db
    .delete(verification)
    .where(and(eq(verification.value, token), gt(verification.expiresAt, now)))
    .returning()

  const row = deleted[0]
  if (!row) return null
  if (!row.identifier.startsWith(INVITE_PREFIX)) return null
  return { userId: row.identifier.slice(INVITE_PREFIX.length) }
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invite.ts
git commit -m "Add invite token module backed by verification table"
```

---

## Task 14: Test the invite token module

**Files:**
- Create: `src/__tests__/invite.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "#/db"
import { user, verification } from "#/db/schema"
import { eq, like } from "drizzle-orm"
import { createInvite, peekInvite, consumeInvite } from "#/lib/invite"

const PREFIX = "invite-test-"

async function makeUser(suffix: string) {
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    email: `${PREFIX}${suffix}@example.com`,
    name: "Invitee",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any) // additionalFields require role/shopId; cast for test fixture
  return id
}

async function cleanup() {
  await db
    .delete(verification)
    .where(like(verification.identifier, "invite:%"))
  await db.execute(
    `DELETE FROM "user" WHERE email LIKE '${PREFIX}%'`,
  )
}

describe("invite token module", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("createInvite returns a token and stores a verification row", async () => {
    const userId = await makeUser("a")
    const { token, expiresAt } = await createInvite({ userId })
    expect(token.length).toBeGreaterThan(20)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    const rows = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, "invite:" + userId))
    expect(rows).toHaveLength(1)
  })

  it("peekInvite returns userId for a valid token without consuming", async () => {
    const userId = await makeUser("b")
    const { token } = await createInvite({ userId })
    const a = await peekInvite(token)
    const b = await peekInvite(token)
    expect(a).toEqual({ userId })
    expect(b).toEqual({ userId })
  })

  it("consumeInvite returns userId once and deletes the row", async () => {
    const userId = await makeUser("c")
    const { token } = await createInvite({ userId })
    const first = await consumeInvite(token)
    const second = await consumeInvite(token)
    expect(first).toEqual({ userId })
    expect(second).toBeNull()
  })

  it("rotating createInvite invalidates the old token", async () => {
    const userId = await makeUser("d")
    const { token: t1 } = await createInvite({ userId })
    await createInvite({ userId })
    const result = await consumeInvite(t1)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm dotenv -e .env.local -- vitest run src/__tests__/invite.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/invite.test.ts
git commit -m "Test invite token create/peek/consume/rotate"
```

---

## Task 15: Build admin server functions for users

**Files:**
- Create: `src/server/functions/admin/users.ts`

- [ ] **Step 1: Write it**

```ts
import { createServerFn } from "@tanstack/react-start"
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { user } from "#/db/schema"
import { auth } from "#/lib/auth"
import {
  createInvite,
  consumeInvite,
  peekInvite,
} from "#/lib/invite"
import { sendInviteEmail } from "#/lib/email"
import { env } from "#/env"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { randomBytes } from "node:crypto"

function tempPassword() {
  return randomBytes(24).toString("base64url") + "Aa1!"
}

const inviteInput = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["admin", "supervisor", "sales"]),
  shopId: z.string().uuid().optional(),
})

export const inviteUser = createServerFn()
  .inputValidator(inviteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const headers = getRequestHeaders()
    const created = await auth.api.createUser({
      headers,
      body: {
        email: data.email,
        password: tempPassword(),
        name: data.name,
        role: data.role,
        data: { shopId: data.shopId ?? null, emailVerified: true },
      },
    })

    const userId = (created as { user: { id: string } }).user.id
    const { token } = await createInvite({ userId })
    const url = `${env.APP_URL}/accept-invite?token=${token}`
    await sendInviteEmail({
      to: data.email,
      name: data.name,
      inviterName: session.user.name ?? session.user.email,
      url,
    })
    return { ok: true as const, userId }
  })

export const resendInvite = createServerFn()
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const target = await db
      .select()
      .from(user)
      .where(eq(user.id, data.userId))
      .limit(1)
    const u = target[0]
    if (!u) throw new Error("User not found")

    const { token } = await createInvite({ userId: u.id })
    const url = `${env.APP_URL}/accept-invite?token=${token}`
    await sendInviteEmail({
      to: u.email,
      name: u.name ?? u.email,
      inviterName: session.user.name ?? session.user.email,
      url,
    })
    return { ok: true as const }
  })

const acceptInput = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export const acceptInvite = createServerFn()
  .inputValidator(acceptInput)
  .handler(async ({ data }) => {
    const consumed = await consumeInvite(data.token)
    if (!consumed) {
      throw new Error("Invite is invalid or expired")
    }

    const target = await db
      .select()
      .from(user)
      .where(eq(user.id, consumed.userId))
      .limit(1)
    const u = target[0]
    if (!u) throw new Error("Invited user no longer exists")

    // Set password via better-auth admin API (server-side, bypasses session check)
    await auth.api.setUserPassword({
      headers: getRequestHeaders(),
      body: { userId: u.id, newPassword: data.password },
    })

    // Mint a session and return its Set-Cookie headers to the browser
    const response = await auth.api.signInEmail({
      body: { email: u.email, password: data.password },
      asResponse: true,
    })

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        setResponseHeader("set-cookie", value)
      }
    })

    return { ok: true as const }
  })

export const peekInviteServer = createServerFn()
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const peek = await peekInvite(data.token)
    if (!peek) return { valid: false as const }
    const target = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, peek.userId))
      .limit(1)
    const u = target[0]
    if (!u) return { valid: false as const }
    return {
      valid: true as const,
      email: u.email,
      name: u.name ?? u.email,
    }
  })

export const removeUser = createServerFn()
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    if (session.user.id === data.userId) {
      throw new Error("You cannot remove yourself")
    }
    await auth.api.removeUser({
      headers: getRequestHeaders(),
      body: { userId: data.userId },
    })
    return { ok: true as const }
  })

export const listUsers = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])
  const result = await auth.api.listUsers({
    headers: getRequestHeaders(),
    query: { limit: "200" },
  })
  return result
})
```

> The exact API surface for `auth.api.setUserPassword`, `auth.api.createUser`, `auth.api.removeUser`, and `auth.api.listUsers` may need small shape tweaks (e.g. `query` type, `body` type) depending on the better-auth admin plugin version. If TS errors point at one of those calls, log `Object.keys(auth.api)` once to confirm the method exists and its signature, then adjust.

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS (with possible narrow `as any` casts on better-auth admin plugin call sites).

- [ ] **Step 3: Commit**

```bash
git add src/server/functions/admin/users.ts
git commit -m "Add admin server fns for invite/accept/list/remove users"
```

---

## Task 16: Test the invite → accept end-to-end

**Files:**
- Modify: `src/__tests__/auth-emails.test.ts` — append new describe block

- [ ] **Step 1: Append the test**

```ts
import { acceptInvite } from "#/server/functions/admin/users"
import { createInvite } from "#/lib/invite"

describe("invite + accept flow", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("acceptInvite sets password, deletes the invite row, and signs the user in", async () => {
    const email = `${TEST_PREFIX}invitee-${Date.now()}@example.com`
    // Bypass admin server fn for unit test — call createUser via auth.api directly
    const created = await auth.api.signUpEmail({
      body: { email, password: "throwaway1234", name: "Invitee" },
    })
    const userId = (created as any).user.id
    // Wipe email-verified to mimic admin-created user
    await db.execute(
      `UPDATE "user" SET email_verified = TRUE WHERE email = '${email}'`,
    )

    const { token } = await createInvite({ userId })
    const result = await acceptInvite({ data: { token, password: "newPass1234" } })
    expect(result.ok).toBe(true)

    // Token consumed
    const second = await acceptInvite({
      data: { token, password: "anything12" },
    }).catch((e: Error) => e)
    expect((second as Error).message).toMatch(/invalid|expired/i)
  })
})
```

- [ ] **Step 2: Run**

Run: `pnpm dotenv -e .env.local -- vitest run src/__tests__/auth-emails.test.ts`
Expected: PASS (3 tests total now).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/auth-emails.test.ts
git commit -m "Test invite acceptance + token single-use"
```

---

## Task 17: Build `/accept-invite`

**Files:**
- Create: `src/routes/accept-invite.tsx`

- [ ] **Step 1: Write it**

```tsx
import { createFileRoute, Link, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Logo } from "#/components/logo"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  acceptInvite,
  peekInviteServer,
} from "#/server/functions/admin/users"

export const Route = createFileRoute("/accept-invite")({
  validateSearch: z.object({ token: z.string().min(1) }),
  loader: async ({ search }) => {
    const result = await peekInviteServer({ data: { token: search.token } })
    return { peek: result }
  },
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const { peek } = Route.useLoaderData()
  const { token } = Route.useSearch()
  const router = useRouter()

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  if (!peek.valid) {
    return (
      <Centered>
        <h1 className="text-[20px] font-semibold">Invite no longer valid</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          This invite link has expired or has already been used. Ask your
          administrator for a new one.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block text-[13px] font-medium text-primary hover:underline"
        >
          Go to sign in
        </Link>
      </Centered>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setPending(true)
    try {
      await acceptInvite({ data: { token, password } })
      router.navigate({ to: "/" })
    } catch (err) {
      setError((err as Error).message ?? "Could not accept invite.")
      setPending(false)
    }
  }

  return (
    <Centered>
      <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
        Welcome to Inventory Management
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Set a password for <strong>{peek.email}</strong> to finish setting up
        your account.
      </p>
      <div
        className="mt-6 rounded-2xl bg-white p-6 text-left"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px]">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-[13px]">
              Confirm password
            </Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              className="h-10 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            className="h-10 w-full rounded-xl text-[13px] font-semibold"
            disabled={pending}
          >
            {pending ? "Setting up..." : "Set password & sign in"}
          </Button>
        </form>
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7]">
      <div className="w-full max-w-[420px] px-6 text-center">
        <Logo className="mx-auto size-12 shadow-md" />
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/accept-invite.tsx
git commit -m "Add /accept-invite route"
```

---

## Task 18: Build `/settings/users`

**Files:**
- Create: `src/routes/settings/users.tsx`

- [ ] **Step 1: Write it**

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  inviteUser,
  resendInvite,
  removeUser,
  listUsers,
} from "#/server/functions/admin/users"

export const Route = createFileRoute("/settings/users")({
  loader: async () => {
    const users = await listUsers()
    return { users }
  },
  component: UsersPage,
})

type Row = {
  id: string
  email: string
  name?: string | null
  role?: string | null
  emailVerified?: boolean | null
}

function UsersPage() {
  const { users } = Route.useLoaderData()
  const router = Route.useRouter()
  const list: Row[] = (users as { users: Row[] } | Row[] as any).users ?? users
  const [open, setOpen] = useState(false)

  const invite = useMutation({
    mutationFn: (input: {
      email: string
      name: string
      role: "admin" | "supervisor" | "sales"
    }) => inviteUser({ data: input }),
    onSuccess: () => {
      setOpen(false)
      router.invalidate()
    },
  })

  const resend = useMutation({
    mutationFn: (userId: string) => resendInvite({ data: { userId } }),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removeUser({ data: { userId } }),
    onSuccess: () => router.invalidate(),
  })

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Users</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Invite user</Button>
          </DialogTrigger>
          <InviteDialog
            onSubmit={(values) => invite.mutate(values)}
            pending={invite.isPending}
            error={invite.error?.message}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.role ?? "sales"}</TableCell>
                  <TableCell>
                    {u.emailVerified ? "Active" : "Invited"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {!u.emailVerified && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resend.mutate(u.id)}
                        disabled={resend.isPending}
                      >
                        Resend invite
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remove ${u.email}?`)) remove.mutate(u.id)
                      }}
                      disabled={remove.isPending}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["admin", "supervisor", "sales"]),
})

function InviteDialog({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (v: z.infer<typeof inviteSchema>) => void
  pending: boolean
  error?: string
}) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState<"admin" | "supervisor" | "sales">("sales")

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = inviteSchema.safeParse({ email, name, role })
    if (!parsed.success) return
    onSubmit(parsed.data)
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invite a new user</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-destructive/8 px-4 py-3 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name</Label>
          <Input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select
            value={role}
            onValueChange={(v) =>
              setRole(v as "admin" | "supervisor" | "sales")
            }
          >
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Sending..." : "Send invite"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc -p . --noEmit`

Expected: PASS. The cast `as any` on the listUsers result is a deliberate concession — better-auth's admin plugin response shape varies. Drop the cast once the actual shape is logged.

- [ ] **Step 3: Manual run**

Run: `pnpm dev`. Sign in as the bootstrap admin, navigate to `/settings/users`, click "Invite user", invite a fake email, watch the row appear with status "Invited", and check the Resend logs to confirm an email was attempted.

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/users.tsx
git commit -m "Add /settings/users admin page with invite/resend/remove"
```

---

## Task 19: Cypress E2E

**Files:**
- Modify: `cypress/e2e/01-auth.cy.ts` (replace existing — flow has changed)
- Create: `cypress/e2e/07-auth-emails.cy.ts`

The existing `01-auth.cy.ts` calls `signup` then `login`. Under the new rules, `signup` only works on a fresh DB (zero users), and the user must verify before they can sign in. Replace the assertion in the existing `signs in with valid credentials` test with one that asserts the unverified-error response, OR set the user's `emailVerified` flag to true via `cy.dbQuery` between signup and login. Use the latter — it keeps the suite green without requiring mailbox stubs.

- [ ] **Step 1: Update `01-auth.cy.ts`**

```ts
describe("Authentication", () => {
  const testUser = {
    name: "Test Admin",
    email: `test-admin-${Date.now()}@test.com`,
    password: "TestPassword123!",
  }

  before(() => {
    // Wipe any prior bootstrap admin so signup is allowed
    cy.cleanupAllTestData()
  })

  after(() => {
    cy.cleanupTestUser(testUser.email)
  })

  it("signs up the bootstrap admin", () => {
    cy.signup(testUser.name, testUser.email, testUser.password).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 201])
    })
  })

  it("blocks sign-in until email is verified", () => {
    cy.request({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { Origin: "http://localhost:3000" },
      body: { email: testUser.email, password: testUser.password },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(200)
    })
  })

  it("signs in after manually marking email verified", () => {
    cy.dbQuery(
      `UPDATE "user" SET email_verified = TRUE WHERE email = '${testUser.email}'`,
    )
    cy.login(testUser.email, testUser.password)
    cy.request("/api/auth/get-session").then((resp) => {
      expect(resp.status).to.eq(200)
      expect(resp.body.user.email).to.eq(testUser.email)
    })
  })

  it("blocks a second self-signup", () => {
    cy.request({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { Origin: "http://localhost:3000" },
      body: {
        email: `second-${Date.now()}@test.com`,
        password: "Whatever1234",
        name: "Second",
      },
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.not.eq(200)
    })
  })
})
```

- [ ] **Step 2: Add `07-auth-emails.cy.ts`**

```ts
describe("Auth email flows", () => {
  const adminEmail = `e2e-admin-${Date.now()}@test.com`
  const adminPassword = "AdminPass1234"

  before(() => {
    cy.cleanupAllTestData()
    cy.signup("E2E Admin", adminEmail, adminPassword).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 201])
    })
    cy.dbQuery(
      `UPDATE "user" SET email_verified = TRUE WHERE email = '${adminEmail}'`,
    )
    cy.loginAndCache(adminEmail, adminPassword)
  })

  after(() => {
    cy.cleanupAllTestData()
  })

  it("forgot-password page always shows generic success", () => {
    cy.visit("/forgot-password")
    cy.get("input#email").type("nobody-here@example.com")
    cy.contains("button", "Send reset link").click()
    cy.contains("If an account exists for that email").should("be.visible")
  })

  it("admin can invite a user; row shows Invited status", () => {
    cy.loginAndCache(adminEmail, adminPassword)
    cy.visit("/settings/users")
    cy.contains("button", "Invite user").click()
    cy.get("input#invite-name").type("Invitee Person")
    const inviteeEmail = `invitee-${Date.now()}@test.com`
    cy.get("input#invite-email").type(inviteeEmail)
    cy.contains("button", "Send invite").click()
    cy.contains(inviteeEmail).should("be.visible")
    cy.contains("tr", inviteeEmail).contains("Invited")
    cy.contains("tr", inviteeEmail).contains("Resend invite")
  })
})
```

- [ ] **Step 3: Run the suite**

Run: `pnpm dev` in one terminal, then in another:
```bash
pnpm test:e2e --spec "cypress/e2e/01-auth.cy.ts,cypress/e2e/07-auth-emails.cy.ts"
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cypress/e2e/01-auth.cy.ts cypress/e2e/07-auth-emails.cy.ts
git commit -m "Update auth E2E for verification gating + add invite flow tests"
```

---

## Task 20: Final integration check

- [ ] **Step 1: Run full test suite**

```bash
pnpm dotenv -e .env.local -- pnpm test
pnpm tsc -p . --noEmit
pnpm lint
```
Expected: All green.

- [ ] **Step 2: Manual smoke**

With `pnpm dev`:
1. Wipe users (`pnpm dotenv -e .env.local -- tsx -e "import { db } from './src/db'; await db.execute(\`DELETE FROM verification; DELETE FROM session; DELETE FROM account; DELETE FROM \\\"user\\\";\`); process.exit(0)"`)
2. Visit `/login` — see "Create the first admin account"
3. Sign up — land on `/verify-email-sent` and check Resend dashboard for the email
4. In dev DB, set `email_verified = TRUE` for that user
5. Visit `/login` — see invite-only login. Sign in.
6. Visit `/settings/users` — invite a user. Confirm the row appears.
7. Open the dev mailbox / Resend dashboard. Click the invite link. Set a password. Land on `/`.
8. Sign out. Try `/forgot-password`. Submit. Get generic success.

- [ ] **Step 3: Commit nothing further** (the smoke test is for confidence, not for the repo).

---

## Self-Review Notes

- Spec coverage: each spec section maps to at least one task above (deps → T1; templates → T2-T4; email module → T5; auth wiring + signup-block → T6, T7, T8; verify-sent → T9; reset → T10-T11; auth tests → T12; invite token → T13-T14; admin server fns → T15-T16; accept-invite → T17; users page → T18; E2E → T19; smoke → T20).
- Better-auth admin plugin types: tasks 15 and 18 carry explicit notes that exact response shapes may need narrow `as any` casts on first pass; the implementer is told what to log and how to refine.
- Token consumption: `consumeInvite` is atomic via `DELETE … RETURNING`; tested in T14.
- Email enumeration: `/forgot-password` always returns generic success (T10).
