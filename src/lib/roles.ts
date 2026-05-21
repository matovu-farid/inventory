/**
 * Application roles — single source of truth.
 *
 * These literal strings are used in:
 *  - the `user.role` DB column (as a free-form text)
 *  - Better Auth admin-plugin role declarations (see lib/auth.ts)
 *  - RBAC checks (server/middleware/rbac.ts)
 *  - Zod enums in server functions
 *  - role-pickers in the UI
 */
export const ROLES = ["admin", "supervisor", "sales"] as const

export type Role = (typeof ROLES)[number]
