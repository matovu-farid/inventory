import type { Session } from "#/lib/auth"

export type Role = "admin" | "supervisor" | "sales"

export function requireRole(session: Session, allowedRoles: Role[]): void {
  const role = (session.user as { role?: string }).role as Role | undefined
  if (!role || !allowedRoles.includes(role)) {
    throw new Error("Forbidden: insufficient permissions")
  }
}

export function hasRole(session: Session, allowedRoles: Role[]): boolean {
  const role = (session.user as { role?: string }).role as Role | undefined
  return !!role && allowedRoles.includes(role)
}
