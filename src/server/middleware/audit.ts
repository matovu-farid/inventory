export interface AuditEntryParams {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  metadata?: unknown
  ipAddress?: string | null
  userAgent?: string | null
}

export interface AuditEntry {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  before: unknown
  after: unknown
  metadata: unknown
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

export function buildAuditEntry(params: AuditEntryParams): AuditEntry {
  if (!params.actorUserId) throw new Error("audit: actorUserId required")
  if (!params.action) throw new Error("audit: action required")
  if (!params.entityType) throw new Error("audit: entityType required")
  if (!params.entityId) throw new Error("audit: entityId required")

  return {
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before: params.before ?? null,
    after: params.after ?? null,
    metadata: params.metadata ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    createdAt: new Date(),
  }
}
