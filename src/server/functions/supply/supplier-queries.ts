import { isNull } from 'drizzle-orm'
import { db } from '#/db'
import { suppliers } from '#/db/schema'

export async function listSuppliersQuery(input?: {
  includeArchived?: boolean
}) {
  return db
    .select()
    .from(suppliers)
    .where(input?.includeArchived ? undefined : isNull(suppliers.deletedAt))
    .orderBy(suppliers.name)
}

export async function listSuppliersForSelectQuery(input?: {
  includeArchived?: boolean
}) {
  return db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      type: suppliers.type,
      country: suppliers.country,
      deletedAt: suppliers.deletedAt,
    })
    .from(suppliers)
    .where(input?.includeArchived ? undefined : isNull(suppliers.deletedAt))
    .orderBy(suppliers.name)
}
