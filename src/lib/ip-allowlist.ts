import { db } from "#/db"
import { adminIpAllowlist, ipBlockLog } from "#/db/schema"
import { systemSettings } from "#/db/schema/notifications"
import { eq, sql } from "drizzle-orm"

const TOGGLE_KEY = "ip_allowlist_enabled"
const TOGGLE_TTL_MS = 30_000
const IP_TTL_MS = 30_000
const IP_CACHE_MAX = 1000

// ─── Dependency injection seam (for tests) ───────────────────────────────────

interface Deps {
  readSetting: (key: string) => Promise<string | null>
  ipExists: (ip: string) => Promise<boolean>
  upsertAllowlist: (
    userId: string,
    ip: string,
  ) => Promise<{ inserted: boolean }>
  trimAllowlist: (userId: string, cap: number) => Promise<void>
  insertBlock: (userId: string, ip: string, path: string) => Promise<void>
}

const defaultDeps: Deps = {
  async readSetting(key) {
    const rows = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1)
    const raw = rows[0]?.value
    if (raw === null || raw === undefined) return null
    // value is stored as jsonb; may be a boolean, string, or wrapped string
    if (typeof raw === "boolean") return raw ? "true" : "false"
    if (typeof raw === "string") return raw
    return String(raw)
  },

  async ipExists(ip) {
    const rows = await db
      .select({ id: adminIpAllowlist.id })
      .from(adminIpAllowlist)
      .where(eq(adminIpAllowlist.ip, ip))
      .limit(1)
    return rows.length > 0
  },

  async upsertAllowlist(userId, ip) {
    const result = await db.execute(sql`
      INSERT INTO admin_ip_allowlist ("user_id", "ip", "last_seen_at", "created_at")
      VALUES (${userId}, ${ip}, now(), now())
      ON CONFLICT ("user_id", "ip") DO UPDATE SET "last_seen_at" = now()
      RETURNING (xmax = 0) AS inserted
    `)
    const row = (result as unknown as Array<{ inserted: boolean }>)[0]
    return { inserted: !!row?.inserted }
  },

  async trimAllowlist(userId, cap) {
    await db.execute(sql`
      DELETE FROM admin_ip_allowlist
      WHERE "id" IN (
        SELECT "id" FROM admin_ip_allowlist
        WHERE "user_id" = ${userId}
        ORDER BY "last_seen_at" ASC
        OFFSET ${cap}
      )
    `)
  },

  async insertBlock(userId, ip, path) {
    await db.insert(ipBlockLog).values({ userId, ip, path })
  },
}

let deps: Deps = defaultDeps

/** Test-only seam — replace selected dep methods. */
export function __setIpAllowlistDepsForTests(overrides: Partial<Deps>): void {
  deps = { ...defaultDeps, ...overrides }
}

// ─── Caches ───────────────────────────────────────────────────────────────────

let toggleCache: { value: boolean; expiresAt: number } | null = null
const ipCache = new Map<string, { value: boolean; expiresAt: number }>()

export function clearCaches(): void {
  toggleCache = null
  ipCache.clear()
}

function ipCacheSet(ip: string, value: boolean): void {
  if (ipCache.size >= IP_CACHE_MAX) {
    const oldest = ipCache.keys().next().value
    if (oldest !== undefined) ipCache.delete(oldest)
  }
  ipCache.set(ip, { value, expiresAt: Date.now() + IP_TTL_MS })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extracts client IP from request headers.
 * Strips IPv6-mapped IPv4 prefix `::ffff:` if present.
 */
export function getClientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for")
  if (fwd) {
    const first = fwd.split(",")[0]?.trim()
    if (first) return first.replace(/^::ffff:/, "")
  }
  const real = headers.get("x-real-ip")
  if (real) return real.trim().replace(/^::ffff:/, "") || null
  return null
}

/**
 * Returns true if the IP allowlist feature is enabled.
 * 30-second in-memory TTL. Fails open (returns false) on DB error.
 */
export async function isIpAllowlistEnabled(): Promise<boolean> {
  if (toggleCache && toggleCache.expiresAt > Date.now()) return toggleCache.value
  try {
    const raw = await deps.readSetting(TOGGLE_KEY)
    const value = raw === "true"
    toggleCache = { value, expiresAt: Date.now() + TOGGLE_TTL_MS }
    return value
  } catch (err) {
    console.warn("[ip-allowlist] toggle read failed; failing open", err)
    return false
  }
}

/**
 * Returns true if the given IP is in any admin's allowlist.
 * 30-second in-memory LRU cache, max 1000 entries. Fails closed (returns false) on error.
 */
export async function isIpAllowed(ip: string): Promise<boolean> {
  const hit = ipCache.get(ip)
  if (hit && hit.expiresAt > Date.now()) return hit.value
  try {
    const value = await deps.ipExists(ip)
    ipCacheSet(ip, value)
    return value
  } catch (err) {
    console.warn("[ip-allowlist] ip lookup failed; failing closed", err)
    return false
  }
}

/**
 * Upserts (userId, ip) into admin_ip_allowlist and bumps lastSeenAt.
 * Enforces a 100-entry cap per user (evicts oldest by lastSeenAt).
 */
export async function recordAdminLoginIp(
  userId: string,
  ip: string,
): Promise<void> {
  try {
    const { inserted } = await deps.upsertAllowlist(userId, ip)
    if (inserted) {
      ipCache.delete(ip)
      await deps.trimAllowlist(userId, 100)
    }
  } catch (err) {
    console.warn("[ip-allowlist] record login ip failed", { userId, ip, err })
  }
}

/**
 * Logs a blocked access attempt to ip_block_log.
 */
export async function logBlockedAttempt(
  userId: string,
  ip: string,
  path: string,
): Promise<void> {
  try {
    await deps.insertBlock(userId, ip, path)
  } catch (err) {
    console.warn("[ip-allowlist] block log insert failed", err)
  }
}
