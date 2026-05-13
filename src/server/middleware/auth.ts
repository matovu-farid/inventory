import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "#/lib/auth"
import type { Session } from "#/lib/auth"
import { getClientIp, recordAdminLoginIp } from "#/lib/ip-allowlist"

export const getSession = createServerFn().handler(
  async (): Promise<Session | null> => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    return session
  },
)

export const requireSession = createServerFn().handler(
  async (): Promise<Session> => {
    const headers = getRequestHeaders()
    const session = await auth.api.getSession({ headers })
    if (!session) {
      throw new Error("Unauthorized")
    }

    // Lazily record admin IPs on every authenticated request so that the
    // allowlist stays up-to-date without requiring a dedicated auth hook.
    const role = (session.user as { role?: string }).role
    if (role === "admin") {
      // Prefer the IP stored on the session row (populated by Better Auth),
      // falling back to request headers.
      const sessionIp =
        (session.session as { ipAddress?: string | null }).ipAddress ?? null
      const ip = sessionIp ?? getClientIp(headers)
      if (ip) {
        // Fire-and-forget — never block the request path.
        void recordAdminLoginIp(session.user.id, ip)
      }
    }

    return session
  },
)
