// Client-reachable wrapper module: declares the createServerFn() wrapper
// for the audit-by-article endpoint. All actual data access lives in
// `./list-by-article.server` — that file is excluded from the client
// bundle by TanStack's import-protection plugin (`.server.ts` suffix).
//
// Keeping `#/db` out of this file's module scope is mandatory: this module
// is reachable from src/routes/items/$articleNumber.tsx via the
// routeTree (→ audit-activity-panel.tsx), and the plugin walks the static
// import graph regardless of whether the imports are only used inside
// server-fn handlers.

import { createServerFn } from '@tanstack/react-start'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  listAuditLogByArticleInputSchema,
  queryAuditLogByArticle,
} from './list-by-article.server'

export const listAuditLogByArticle = createServerFn()
  .inputValidator(listAuditLogByArticleInputSchema)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])
    return queryAuditLogByArticle(data)
  })
