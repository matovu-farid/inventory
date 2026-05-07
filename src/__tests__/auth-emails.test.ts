import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { db } from "#/db"

vi.mock("#/lib/email", async () => {
  return {
    sendVerificationEmail: vi.fn(async () => undefined),
    sendPasswordResetEmail: vi.fn(async () => undefined),
    sendInviteEmail: vi.fn(async () => undefined),
  }
})

import * as emailMod from "#/lib/email"
import { auth } from "#/lib/auth"
import * as schema from "#/db/schema"
import { eq } from "drizzle-orm"

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
