import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '#/db'
import { user, verification } from '#/db/schema'
import { eq, like } from 'drizzle-orm'
import { createInvite, peekInvite, consumeInvite } from '#/lib/invite'

const PREFIX = 'invite-test-'

async function makeUser(suffix: string) {
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    email: `${PREFIX}${suffix}@example.com`,
    name: 'Invitee',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) // additionalFields require role/shopId; cast for test fixture
  return id
}

async function cleanup() {
  await db.delete(verification).where(like(verification.identifier, 'invite:%'))
  await db.execute(`DELETE FROM "user" WHERE email LIKE '${PREFIX}%'`)
}

describe('invite token module', () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  it('createInvite returns a token and stores a verification row', async () => {
    const userId = await makeUser('a')
    const { token, expiresAt } = await createInvite({ userId })
    expect(token.length).toBeGreaterThan(20)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    const rows = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, 'invite:' + userId))
    expect(rows).toHaveLength(1)
  })

  it('peekInvite returns userId for a valid token without consuming', async () => {
    const userId = await makeUser('b')
    const { token } = await createInvite({ userId })
    const a = await peekInvite(token)
    const b = await peekInvite(token)
    expect(a).toEqual({ userId })
    expect(b).toEqual({ userId })
  })

  it('consumeInvite returns userId once and deletes the row', async () => {
    const userId = await makeUser('c')
    const { token } = await createInvite({ userId })
    const first = await consumeInvite(token)
    const second = await consumeInvite(token)
    expect(first).toEqual({ userId })
    expect(second).toBeNull()
  })

  it('rotating createInvite invalidates the old token', async () => {
    const userId = await makeUser('d')
    const { token: t1 } = await createInvite({ userId })
    await createInvite({ userId })
    const result = await consumeInvite(t1)
    expect(result).toBeNull()
  })
})
