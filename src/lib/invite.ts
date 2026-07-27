import { randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '#/db'
import { verification } from '#/db/schema'

const INVITE_PREFIX = 'invite:'
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function makeToken(): string {
  return randomBytes(32).toString('base64url')
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

  const row = rows.at(0)
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

  const row = deleted.at(0)
  if (!row) return null
  if (!row.identifier.startsWith(INVITE_PREFIX)) return null
  return { userId: row.identifier.slice(INVITE_PREFIX.length) }
}
