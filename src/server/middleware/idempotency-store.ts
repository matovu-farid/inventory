import { and, eq, gt, lt } from 'drizzle-orm'
import { idempotencyKeys } from '#/db/schema'
import type { Database } from '#/db'
import type { IdempotencyStore } from './idempotency'

export function makeDbIdempotencyStore(db: Database): IdempotencyStore {
  return {
    async get(key) {
      const rows = await db
        .select({ response: idempotencyKeys.response })
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, key),
            gt(idempotencyKeys.expiresAt, new Date()),
          ),
        )
        .limit(1)
      if (rows.length === 0) return null
      const value = rows[0].response
      return typeof value === 'string' ? value : JSON.stringify(value)
    },
    async set(key, response, expiresAt) {
      await db
        .insert(idempotencyKeys)
        .values({ key, response: JSON.parse(response), expiresAt })
        .onConflictDoUpdate({
          target: idempotencyKeys.key,
          set: { response: JSON.parse(response), expiresAt },
        })
    },
  }
}

export async function purgeExpiredIdempotencyKeys(db: Database): Promise<void> {
  await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, new Date()))
}
