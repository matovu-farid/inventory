// Client-reachable wrapper module: declares the createServerFn() wrapper
// for the audit-log list endpoint and re-exports the row/page TYPES so
// client components can `import type` them through this stable path. All
// actual data access lives in `./list.server` — that file is excluded from
// the client bundle by TanStack's import-protection plugin (`.server.ts`
// suffix).
//
// Keeping `#/db` out of this file's module scope is mandatory: this module
// is reachable from src/routes/settings/audit-log.tsx (value import of
// `listAuditLog`) via the routeTree, and the plugin walks the static
// import graph regardless of whether the imports are only used inside
// server-fn handlers. Type-only re-exports use `export type`, which the
// plugin recognises as erased at compile time and therefore safe.

import { createServerFn } from '@tanstack/react-start'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'
import {
  listAuditLogInputSchema,
  queryAuditLog,
} from './list.server'

export type {
  AuditJsonValue,
  AuditLogPage,
  AuditLogRow,
  ListAuditLogInput,
} from './list.server'

// Also re-export the Zod schema so existing consumers (and the wrapper
// below) can reach it through the canonical path.
export { listAuditLogInputSchema } from './list.server'

export const listAuditLog = createServerFn()
  .inputValidator(listAuditLogInputSchema)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin'])
    return queryAuditLog(data)
  })
