import type { Tx } from '#/db'
import { auditLogs } from '#/db/schema'
import { buildAuditEntry } from './audit'
import type { AuditEntryParams } from './audit'

export async function recordAuditLog(
  tx: Tx,
  params: AuditEntryParams,
): Promise<void> {
  const entry = buildAuditEntry(params)
  await tx.insert(auditLogs).values(entry)
}
