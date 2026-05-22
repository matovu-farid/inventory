import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "#/db"
import { auditLogs, user } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const DEFAULT_PAGE = 50

export const listAuditLogInputSchema = z.object({
  articleNumber: z.string().min(1).optional(),
  actorUserId: z.string().optional(),
  actions: z.array(z.string()).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  pageSize: z.number().int().min(1).max(200).optional(),
  cursor: z
    .object({
      effectiveDate: z.coerce.date(),
      id: z.string(),
    })
    .optional(),
})

export type ListAuditLogInput = z.infer<typeof listAuditLogInputSchema>

// jsonb columns are typed via a JSON-value union so the row type is
// serializable by TanStack's SSR transformer (which rejects `unknown`).
export type AuditJsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: AuditJsonValue }
  | AuditJsonValue[]

export type AuditLogRow = {
  id: string
  action: string
  entityType: string
  entityId: string
  description: string
  articleNumbers: string[]
  businessDate: Date | null
  createdAt: Date
  actorUserId: string
  actorName: string | null
  before: AuditJsonValue
  after: AuditJsonValue
  metadata: AuditJsonValue
}

export type AuditLogPage = {
  rows: AuditLogRow[]
  nextCursor: { effectiveDate: Date; id: string } | null
}

/**
 * Pure query helper. Exposed for tests and for any server-side caller that
 * already has a session (e.g. internal scripts). All RBAC gating happens in
 * the server-fn wrapper below — this function trusts its caller.
 */
export async function queryAuditLog(
  data: ListAuditLogInput,
): Promise<AuditLogPage> {
  const pageSize = data.pageSize ?? DEFAULT_PAGE
  const conditions = []

  if (data.articleNumber) {
    conditions.push(
      sql`${auditLogs.articleNumbers} @> ARRAY[${data.articleNumber}]::text[]`,
    )
  }
  if (data.actorUserId) {
    conditions.push(eq(auditLogs.actorUserId, data.actorUserId))
  }
  if (data.actions && data.actions.length > 0) {
    conditions.push(inArray(auditLogs.action, data.actions))
  }
  if (data.from) {
    conditions.push(
      sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) >= ${data.from}`,
    )
  }
  if (data.to) {
    conditions.push(
      sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) <= ${data.to}`,
    )
  }
  if (data.cursor) {
    conditions.push(
      sql`(COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}), ${auditLogs.id}) < (${data.cursor.effectiveDate}, ${data.cursor.id})`,
    )
  }

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      description: auditLogs.description,
      articleNumbers: auditLogs.articleNumbers,
      businessDate: auditLogs.businessDate,
      createdAt: auditLogs.createdAt,
      actorUserId: auditLogs.actorUserId,
      actorName: user.name,
      before: auditLogs.before,
      after: auditLogs.after,
      metadata: auditLogs.metadata,
    })
    .from(auditLogs)
    .leftJoin(user, eq(user.id, auditLogs.actorUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sql`COALESCE(${auditLogs.businessDate}, ${auditLogs.createdAt}) DESC`,
      desc(auditLogs.id),
    )
    .limit(pageSize + 1)

  const hasMore = rows.length > pageSize
  const sliced = hasMore ? rows.slice(0, pageSize) : rows
  const nextCursor = hasMore
    ? {
        effectiveDate:
          sliced[sliced.length - 1].businessDate ??
          sliced[sliced.length - 1].createdAt,
        id: sliced[sliced.length - 1].id,
      }
    : null

  return { rows: sliced as AuditLogRow[], nextCursor }
}

export const listAuditLog = createServerFn()
  .inputValidator(listAuditLogInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    return queryAuditLog(data)
  })
