import { redirect, useRouteContext } from "@tanstack/react-router"
import type { Role } from "#/server/middleware/rbac"

// ─────────────────────────────────────────────────────────────────────────────
// Permission registry
//
// This is the single source of truth for what each role can see in the UI.
// It MUST stay aligned with the `requireRole(...)` calls on the server — those
// gates are the security boundary; this map is the UX boundary.
//
// When you change a server gate, update both the role list below AND the
// PERMISSION_SERVER_GATES map further down. The vitest in
// `src/__tests__/permissions.test.ts` checks the latter against the source.
// ─────────────────────────────────────────────────────────────────────────────

export type Permission =
  | "procurement.view"
  | "warehouse.stock"
  | "warehouse.receiving"
  | "warehouse.transfers"
  | "warehouse.openingBalance"
  | "shop.view"
  | "shop.openingBalance"
  | "sales.view"
  | "customers.view"
  | "reports.view"
  | "users.manage"
  | "products.view"
  | "products.manage"
  | "pos.view"
  | "security.manage"
  | "shift.reports.view"
  | "notifications.manage"
  | "audit.view"

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    "procurement.view",
    "warehouse.stock",
    "warehouse.receiving",
    "warehouse.transfers",
    "warehouse.openingBalance",
    "shop.view",
    "shop.openingBalance",
    "sales.view",
    "customers.view",
    "reports.view",
    "users.manage",
    "products.view",
    "products.manage",
    "pos.view",
    "security.manage",
    "shift.reports.view",
    "notifications.manage",
    "audit.view",
  ],
  supervisor: [
    "warehouse.transfers",
    "warehouse.openingBalance",
    "shop.view",
    "shop.openingBalance",
    "sales.view",
    "customers.view",
    "reports.view",
    "products.view",
    "products.manage",
    "pos.view",
    "shift.reports.view",
    "notifications.manage",
  ],
  sales: ["shop.view", "sales.view", "products.view", "pos.view"],
}

// Map each Permission → server files that enforce it via `requireRole`.
// The vitest harness loads each file and asserts `requireRole` appears,
// preventing the registry from drifting away from real server gates.
export const PERMISSION_SERVER_GATES: Record<Permission, readonly string[]> = {
  "procurement.view": [
    "src/server/functions/supply/routes.ts",
    "src/server/functions/supply/suppliers.ts",
    "src/server/functions/supply/items.ts",
    "src/server/functions/supply/expenses.ts",
  ],
  "warehouse.stock": ["src/server/functions/store/receiving.ts"],
  "warehouse.receiving": ["src/server/functions/store/receiving.ts"],
  "warehouse.transfers": [
    "src/server/functions/store/transfers.ts",
    "src/server/functions/store/returns.ts",
  ],
  "warehouse.openingBalance": [
    "src/server/functions/admin/opening-balance.ts",
  ],
  "shop.view": ["src/server/functions/shop/receipt.ts"],
  "shop.openingBalance": [
    "src/server/functions/admin/opening-balance.ts",
  ],
  "sales.view": ["src/server/functions/shop/sales.ts"],
  "customers.view": ["src/server/functions/customers/customers.ts"],
  "reports.view": [
    "src/server/functions/accounting/reports.ts",
    "src/server/functions/accounting/fund-transfers.ts",
  ],
  "users.manage": ["src/server/functions/admin/users.ts"],
  "security.manage": ["src/server/functions/admin/ip-allowlist.ts"],
  "products.view": [
    "src/server/functions/products/products.ts",
    "src/server/functions/products/colors.ts",
  ],
  "products.manage": [
    "src/server/functions/products/products.ts",
    "src/server/functions/products/colors.ts",
    "src/server/functions/products/uploads.ts",
  ],
  "pos.view": ["src/server/functions/shop/sales.ts"],
  "shift.reports.view": ["src/server/functions/accounting/shift-reports.ts"],
  "notifications.manage": [
    "src/server/functions/notifications/thresholds.ts",
    "src/server/functions/store/requisitions.ts",
    "src/server/functions/shop/restock-suggestions.ts",
  ],
  "audit.view": ["src/server/functions/audit/list.ts"],
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toRole(role: string | undefined | null): Role | undefined {
  if (role === "admin" || role === "supervisor" || role === "sales") return role
  return undefined
}

export function can(
  role: Role | string | undefined | null,
  perm: Permission,
): boolean {
  const r = toRole(role)
  if (!r) return false
  return ROLE_PERMISSIONS[r].includes(perm)
}

export function canAny(
  role: Role | string | undefined | null,
  perms: readonly Permission[],
): boolean {
  return perms.some((p) => can(role, p))
}

/**
 * Use inside a route's `beforeLoad` to redirect users without UI access home.
 * The server still enforces via `requireRole` — this is purely UX.
 */
export function requireUiPermission(
  context: {
    session?:
      | { user?: { role?: string | null } | null }
      | null
      | undefined
  },
  perm: Permission,
): void {
  if (!can(context.session?.user?.role, perm)) {
    throw redirect({ to: "/" })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client hook — reads role from the root route context
// ─────────────────────────────────────────────────────────────────────────────

function useRole(): Role | undefined {
  const ctx = useRouteContext({ from: "__root__" })
  const session = (ctx as { session?: { user?: { role?: string } } }).session
  return toRole(session?.user?.role)
}

export function useCan(perm: Permission): boolean {
  return can(useRole(), perm)
}

export function useCanAny(perms: readonly Permission[]): boolean {
  return canAny(useRole(), perms)
}
