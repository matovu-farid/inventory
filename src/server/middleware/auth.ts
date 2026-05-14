import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "#/lib/auth"
import type { AppSession } from "#/lib/auth"
import { getClientIp, recordAdminLoginIp } from "#/lib/ip-allowlist"

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

    // Lazily record admin IPs on every authenticated request so that the
    // allowlist stays up-to-date without requiring a dedicated auth hook.
    if (session.user.role === "admin") {
      // Prefer the IP stored on the session row (populated by Better Auth),
      // falling back to request headers.
      const ip = session.session.ipAddress ?? getClientIp(headers)
      if (ip) {
        // Fire-and-forget — never block the request path.
        void recordAdminLoginIp(session.user.id, ip)
      }
    }

    return session
  },
)
