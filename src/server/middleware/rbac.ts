import type { AppSession } from "#/lib/auth"
import { enforceIpAllowlist } from "./ip-allowlist"

export type Role = "admin" | "supervisor" | "sales"

export function requireRole(session: AppSession, allowedRoles: Role[]): void {
  // DB stores role as a free-form string; narrow to the validated union here.
  const role = session.user.role as Role | undefined
  if (!role || !allowedRoles.includes(role)) {
    throw new Error("Forbidden: insufficient permissions")
  }
}

export function hasRole(session: AppSession, allowedRoles: Role[]): boolean {
  const role = session.user.role as Role | undefined
  return !!role && allowedRoles.includes(role)
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
