import 'dotenv/config'
import { db } from '../src/db'
import { auditLogs, user } from '../src/db/schema'
import { renderAuditDescription } from '../src/server/audit/descriptions'
import { resolveArticleNumbersForAudit } from '../src/server/audit/article-numbers'
import { eq, isNull, sql } from 'drizzle-orm'

async function main() {
  console.log('Backfilling audit logs...')

  const PAGE = 200
  let totalProcessed = 0

  for (;;) {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(isNull(auditLogs.description))
      .limit(PAGE)

    if (rows.length === 0) break

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const actorRow = await tx
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, row.actorUserId))
          .limit(1)
        const actorName = actorRow[0]?.name ?? '(unknown user)'

        const articleNumbers = await resolveArticleNumbersForAudit(tx, {
          action: row.action,
          entityType: row.entityType,
          entityId: row.entityId,
          metadata: row.metadata,
        })

        const description = renderAuditDescription(row.action, {
          actorName,
          recordedAt: row.createdAt,
          businessDate: row.businessDate,
        })

        await tx
          .update(auditLogs)
          .set({ description, articleNumbers })
          .where(eq(auditLogs.id, row.id))
      }
    })

    totalProcessed += rows.length
    console.log(`  processed ${totalProcessed} rows`)
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(isNull(auditLogs.description))
  if (count > 0) {
    throw new Error(`backfill incomplete: ${count} rows still NULL`)
  }

  console.log(`Done. Total: ${totalProcessed}`)
}

void main()
  .catch((err: unknown) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .then(() => process.exit(0))
