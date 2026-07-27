import { eq } from 'drizzle-orm'
import { user } from '#/db/schema'
import type { Tx } from '#/db'

export async function getActorName(tx: Tx, userId: string): Promise<string> {
  const rows = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.name ?? '(unknown user)'
}
