import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "#/db"

vi.mock("#/lib/email", async () => {
  return {
    sendVerificationEmail: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
    sendInviteEmail: vi.fn(async () => undefined),
  }
})

// setResponseHeader / getRequestHeaders are called when acceptInvite forwards
// Set-Cookie headers from signInEmail. Outside an HTTP request context these
// would throw; mocking them as no-ops lets the unit test run without a server.
vi.mock("@tanstack/react-start/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-start/server")>()
  return {
    ...actual,
    setResponseHeader: vi.fn(),
    getRequestHeaders: vi.fn(() => ({})),
  }
})

import * as emailMod from "#/lib/email"
import { auth } from "#/lib/auth"
import * as schema from "#/db/schema"
import { and, eq } from "drizzle-orm"
import { createInvite, consumeInvite } from "#/lib/invite"
import { hashPassword } from "better-auth/crypto"

const TEST_PREFIX = "test-auth-emails-"

/**
 * WARNING: cleanup() nukes ALL rows in session, account, verification, and user
 * tables. This is intentional — we need to ensure the "first signup" path fires
 * in each test. Only run this test against your local development DB.
 */
async function cleanup() {
  await db.delete(schema.session)
  await db.delete(schema.account)
  await db.delete(schema.verification)
  await db.delete(schema.user)
}

describe("auth emails wiring", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("first signup succeeds and triggers verification email", async () => {
    const email = `test-auth-emails-first-${Date.now()}@example.com`
    await auth.api.signUpEmail({
      body: { email, password: "password123", name: "First Admin" },
    })

    const found = await db
      .select({ id: schema.user.id, role: schema.user.role })
      .from(schema.user)
      .where(eq(schema.user.email, email))

    expect(found[0].role).toBe("admin")
    expect(emailMod.sendVerificationEmail).toHaveBeenCalledOnce()
  })

  it("second signup is rejected", async () => {
    const a = `test-auth-emails-a-${Date.now()}@example.com`
    const b = `test-auth-emails-b-${Date.now()}@example.com`
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

// The TanStack Start server-fn machinery (createServerFn / __executeServer)
// requires a full Vite/SSR build context to resolve the split "serverFn"
// bundle chunk — it is unavailable in Vitest. Per the task spec hedge, we call
// the underlying logic (consumeInvite + hashPassword + db update + signInEmail)
// directly. This mirrors exactly what acceptInvite.handler does.
describe("invite + accept flow", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it("acceptInvite sets password, deletes the invite row, and signs the user in", async () => {
    const email = `${TEST_PREFIX}invitee-${Date.now()}@example.com`

    // Bypass admin server fn for unit test — call signUpEmail directly to set up a user
    const created = await auth.api.signUpEmail({
      body: { email, password: "throwaway1234", name: "Invitee" },
    })
    const userId = (created as any).user.id

    // Mark verified to mimic admin-created user
    await db.execute(
      `UPDATE "user" SET email_verified = TRUE WHERE email = '${email}'`,
    )

    const { token } = await createInvite({ userId })

    // --- replicate acceptInvite.handler logic ---
    const newPassword = "newPass1234"
    const consumed = await consumeInvite(token)
    expect(consumed).not.toBeNull()
    expect(consumed!.userId).toBe(userId)

    // Hash + store new password
    const hashed = await hashPassword(newPassword)
    await db
      .update(schema.account)
      .set({ password: hashed })
      .where(
        and(
          eq(schema.account.userId, userId),
          eq(schema.account.providerId, "credential"),
        ),
      )

    // Verify the new password works for sign-in
    const signInResult = await auth.api.signInEmail({
      body: { email, password: newPassword },
    })
    expect((signInResult as any).user.id).toBe(userId)
    // --- end replicated logic ---

    // Token consumed — second consumeInvite must return null
    const second = await consumeInvite(token)
    expect(second).toBeNull()
  })
})
