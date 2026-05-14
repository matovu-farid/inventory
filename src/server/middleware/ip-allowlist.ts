import type { AppSession } from "#/lib/auth"
import {
  isIpAllowlistEnabled,
  isIpAllowed,
  logBlockedAttempt,
} from "#/lib/ip-allowlist"

/**
 * Enforces the IP allowlist for non-admin roles.
 *
 * Throws with a user-facing message if:
 *   - The user's role is "supervisor" or "sales", AND
 *   - The allowlist feature is enabled, AND
 *   - The request IP is not in any admin's allowlist.
 *
 * Admin role always passes. Fails open if the toggle can't be read.
 * Fails closed (blocks) if the IP lookup errors.
 */
export async function enforceIpAllowlist(
  session: AppSession,
  ip: string | null,
  path: string,
): Promise<void> {
  const role = session.user.role
  if (role === "admin") return

  if (role !== "supervisor" && role !== "sales") return

  const enabled = await isIpAllowlistEnabled()
  if (!enabled) return

  const allowed = ip ? await isIpAllowed(ip) : false
  if (!allowed) {
    void logBlockedAttempt(session.user.id, ip ?? "unknown", path)
    throw new Error(
      "Access blocked: this device or network isn't recognised. Contact your administrator.",
    )
  }
}
