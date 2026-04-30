import type { Database } from "#/db"
import { auditLogs } from "#/db/schema"
import { buildAuditEntry  } from "./audit"
import type {AuditEntryParams} from "./audit";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]

export async function recordAuditLog(
  tx: Tx,
  params: AuditEntryParams,
): Promise<void> {
  const entry = buildAuditEntry(params)
  await tx.insert(auditLogs).values(entry)
}
