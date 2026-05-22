import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "#/db"
import { auditLogs, user } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import type { AuditLogPage, AuditLogRow } from "./list"

const DEFAULT_PAGE = 50

export const listAuditLogByArticleInputSchema = z.object({
  articleNumber: z.string().min(1),
  pageSize: z.number().int().min(1).max(200).optional(),
  cursor: z
    .object({
      effectiveDate: z.coerce.date(),
      id: z.string(),
    })
    .optional(),
})

export type ListAuditLogByArticleInput = z.infer<
  typeof listAuditLogByArticleInputSchema
>

/**
 * Pure query helper. Exposed for tests and for any server-side caller that
 * already has a session. RBAC happens in the server-fn wrapper below.
 */
export async function queryAuditLogByArticle(
  data: ListAuditLogByArticleInput,
): Promise<AuditLogPage> {
  const pageSize = data.pageSize ?? DEFAULT_PAGE
  const conditions = [
    sql`${auditLogs.articleNumbers} @> ARRAY[${data.articleNumber}]::text[]`,
  ]
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
    .where(and(...conditions))
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

  // See list.ts for the rationale: the cast narrows jsonb columns from
  // drizzle's `unknown` to `AuditJsonValue` for SSR serialization.
  return { rows: sliced as AuditLogRow[], nextCursor }
}

export const listAuditLogByArticle = createServerFn()
  .inputValidator(listAuditLogByArticleInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    return queryAuditLogByArticle(data)
  })
