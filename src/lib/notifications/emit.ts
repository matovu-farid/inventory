import { and, inArray, isNotNull } from 'drizzle-orm'
import { notifications, user } from '#/db/schema'
import type { Role } from '#/lib/roles'
import type { Tx } from '#/db'

export interface EmitParams {
  kind: string
  title: string
  body: string
  entityType?: string
  entityId?: string
  roles: Role[]
}

/**
 * Insert one notification row per recipient with the matching role(s).
 * Returns the first inserted notification's id (useful when the caller wants to
 * back-link the alert that triggered the notification). Returns null if no
 * recipients exist.
 */
export async function emitToRoles(
  tx: Tx,
  params: EmitParams,
): Promise<{ id: string } | null> {
  const recipients = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(isNotNull(user.role), inArray(user.role, params.roles)))
  if (recipients.length === 0) return null
  const rows = await tx
    .insert(notifications)
    .values(
      recipients.map((r) => ({
        userId: r.id,
        kind: params.kind,
        title: params.title,
        body: params.body,
        entityType: params.entityType,
        entityId: params.entityId,
      })),
    )
    .returning()
  return rows[0] ? { id: rows[0].id } : null
}
