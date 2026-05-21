import { createServerFn } from "@tanstack/react-start"
import {
  getRequestHeaders,
  setResponseHeader,
} from "@tanstack/react-start/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { hashPassword } from "better-auth/crypto"
import { db } from "#/db"
import { user, account } from "#/db/schema"
import { auth } from "#/lib/auth"
import { createInvite, consumeInvite, peekInvite } from "#/lib/invite"
import { sendInviteEmail } from "#/lib/email"
import { env } from "#/env"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { ROLES } from "#/lib/roles"
import { randomBytes } from "node:crypto"

function tempPassword() {
  return randomBytes(24).toString("base64url") + "Aa1!"
}

const inviteInput = z.object({
  email: z.email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  shopId: z.uuid().optional(),
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
        // Leave emailVerified false until the user accepts the invite. The
        // UI surfaces this as "Invited" with a Resend invite button.
        data: { shopId: data.shopId ?? null, emailVerified: false },
      },
    })

    const userId = created.user.id
    const { token } = await createInvite({ userId })
    const url = `${env.APP_URL}/accept-invite?token=${token}`
    await sendInviteEmail({
      to: data.email,
      name: data.name,
      inviterName: session.user.name,
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
    const u = target.at(0)
    if (!u) throw new Error("User not found")

    const { token } = await createInvite({ userId: u.id })
    const url = `${env.APP_URL}/accept-invite?token=${token}`
    await sendInviteEmail({
      to: u.email,
      name: u.name,
      inviterName: session.user.name,
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
    const u = target.at(0)
    if (!u) throw new Error("Invited user no longer exists")

    // Hash + store the new password directly — setUserPassword requires an
    // admin session which is unavailable on this public endpoint.
    const hashed = await hashPassword(data.password)
    await db
      .update(account)
      .set({ password: hashed })
      .where(
        and(eq(account.userId, u.id), eq(account.providerId, "credential")),
      )

    // Accepting the invite verifies the email. Better Auth's signInEmail
    // below requires emailVerified=true when requireEmailVerification is on.
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, u.id))

    // Mint a session and forward Set-Cookie headers
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
    const u = target.at(0)
    if (!u) return { valid: false as const }
    return {
      valid: true as const,
      email: u.email,
      name: u.name,
    }
  })

export const setUserRole = createServerFn()
  .inputValidator(
    z.object({
      userId: z.string(),
      role: z.enum(ROLES),
    }),
  )
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    if (session.user.id === data.userId) {
      throw new Error("You cannot change your own role")
    }
    await auth.api.setRole({
      headers: getRequestHeaders(),
      body: { userId: data.userId, role: data.role },
    })
    return { ok: true as const }
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
