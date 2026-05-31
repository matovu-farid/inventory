import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "#/lib/auth"
import type { AppSession } from "#/lib/auth"
import { getClientIp, recordAdminLoginIp } from "#/lib/ip-allowlist"
import { enforceIpAllowlist } from "./ip-allowlist"

export const getSession = createServerFn().handler(
  async (): Promise<AppSession | null> => {
    const headers = getRequestHeaders()
    return auth.api.getSession({ headers })
  },
)

export const requireSession = createServerFn().handler(
  async (): Promise<AppSession> => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) {
      throw new Error("Unauthorized")
    }

    const ip = session.session.ipAddress ?? getClientIp(headers)

    // Lazily record admin IPs on every authenticated request so that the
    // allowlist stays up-to-date without requiring a dedicated auth hook.
    if (session.user.role === "admin" && ip) {
      // Fire-and-forget — never block the request path.
      void recordAdminLoginIp(session.user.id, ip)
    }

    // Enforce IP allowlist for non-admin roles when the feature is enabled.
    // Admins always pass; supervisor/sales are checked. No-op when toggle is off.
    await enforceIpAllowlist(session, ip, "requireSession")

    return session
  },
)
