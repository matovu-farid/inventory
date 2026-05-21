import type { AppSession } from "#/lib/auth"
import type { Role } from "#/lib/roles"
import { ROLES } from "#/lib/roles"
import { enforceIpAllowlist } from "./ip-allowlist"

export type { Role } from "#/lib/roles"

// DB stores role as a free-form string; this predicate narrows it to the
// validated union after a runtime membership check. Widening the readonly
// tuple to `readonly string[]` is the standard workaround for the TS
// limitation where `Array.includes` on a literal-typed readonly array
// rejects arbitrary strings.
function isRole(value: string | null | undefined): value is Role {
  return value != null && (ROLES as readonly string[]).includes(value)
}

export function requireRole(session: AppSession, allowedRoles: Role[]): void {
  const role = session.user.role
  if (!isRole(role) || !allowedRoles.includes(role)) {
    throw new Error("Forbidden: insufficient permissions")
  }
}

export function hasRole(session: AppSession, allowedRoles: Role[]): boolean {
  const role = session.user.role
  return isRole(role) && allowedRoles.includes(role)
}

/**
 * Like requireRole, but also enforces the IP allowlist for non-admin roles.
 * Call this instead of requireRole in server functions that should be
 * IP-gated when the feature is enabled.
 *
 * @param ip - Client IP extracted from request headers (use getClientIp).
 * @param path - A label for the current endpoint (used in block logs).
 */
export async function requireRoleWithIpCheck(
  session: AppSession,
  allowedRoles: Role[],
  ip: string | null,
  path: string,
): Promise<void> {
  requireRole(session, allowedRoles)
  await enforceIpAllowlist(session, ip, path)
}
