// Server-only module: query helper + Zod input schema for the audit-by-
// article endpoint. Split out from list-by-article.ts because that file is
// imported by a client-reachable component (src/components/audit/
// audit-activity-panel.tsx → src/routes/products/$articleNumber.tsx);
// TanStack Start's import-protection plugin denies any client-reachable
// module that imports `#/db` at module scope. The `.server.ts` suffix is
// TanStack's canonical marker for a server-only module — the client
// bundle excludes it entirely. See:
// https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
//
// Consumers:
//   - src/server/functions/audit/list-by-article.ts (createServerFn wrapper)
//   - src/__tests__/audit-list.test.ts (vitest, server-side)

import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { auditLogs, user } from '#/db/schema'
import type { AuditLogPage, AuditLogRow } from './list'

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
 * already has a session. RBAC happens in the server-fn wrapper.
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
