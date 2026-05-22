export interface AuditEntryParams {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  description: string
  articleNumbers: string[]
  businessDate?: Date | null
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
  description: string
  articleNumbers: string[]
  businessDate: Date | null
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
  if (!params.description) throw new Error("audit: description required")
  if (!Array.isArray(params.articleNumbers)) {
    throw new Error("audit: articleNumbers must be an array")
  }

  return {
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    description: params.description,
    articleNumbers: params.articleNumbers,
    businessDate: params.businessDate ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    metadata: params.metadata ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    createdAt: new Date(),
  }
}
