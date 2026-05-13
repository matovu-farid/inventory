import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getClientIp,
  isIpAllowlistEnabled,
  isIpAllowed,
  recordAdminLoginIp,
  logBlockedAttempt,
  clearCaches,
  __setIpAllowlistDepsForTests,
} from "#/lib/ip-allowlist"

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeHeaders(entries: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(entries)) h.set(k, v)
  return h
}

// ─── getClientIp ─────────────────────────────────────────────────────────────

describe("getClientIp", () => {
  it("returns first IP from x-forwarded-for", () => {
    const h = makeHeaders({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const h = makeHeaders({ "x-real-ip": "9.10.11.12" })
    expect(getClientIp(h)).toBe("9.10.11.12")
  })

  it("strips ::ffff: IPv6 prefix from x-forwarded-for", () => {
    const h = makeHeaders({ "x-forwarded-for": "::ffff:1.2.3.4" })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  it("strips ::ffff: IPv6 prefix from x-real-ip", () => {
    const h = makeHeaders({ "x-real-ip": "::ffff:9.10.11.12" })
    expect(getClientIp(h)).toBe("9.10.11.12")
  })

  it("returns null when no relevant headers are present", () => {
    expect(getClientIp(new Headers())).toBeNull()
  })
})

// ─── isIpAllowlistEnabled ────────────────────────────────────────────────────

describe("isIpAllowlistEnabled", () => {
  beforeEach(() => {
    clearCaches()
  })

  it("returns false when setting is not set", async () => {
    __setIpAllowlistDepsForTests({ readSetting: async () => null })
    await expect(isIpAllowlistEnabled()).resolves.toBe(false)
  })

  it('returns true when setting is "true"', async () => {
    __setIpAllowlistDepsForTests({ readSetting: async () => "true" })
    await expect(isIpAllowlistEnabled()).resolves.toBe(true)
  })

  it("fails open (returns false) when DB throws", async () => {
    __setIpAllowlistDepsForTests({
      readSetting: async () => {
        throw new Error("db error")
      },
    })
    await expect(isIpAllowlistEnabled()).resolves.toBe(false)
  })

  it("returns cached value within TTL without hitting DB again", async () => {
    const readSetting = vi.fn(async () => "true")
    __setIpAllowlistDepsForTests({ readSetting })
    await isIpAllowlistEnabled()
    await isIpAllowlistEnabled()
    expect(readSetting).toHaveBeenCalledTimes(1)
  })
})

// ─── isIpAllowed ─────────────────────────────────────────────────────────────

describe("isIpAllowed", () => {
  beforeEach(() => {
    clearCaches()
  })

  it("returns false when toggle is disabled (feature off)", async () => {
    // Toggle disabled — isIpAllowed is called independently; it checks the DB
    // directly. When the feature is off the *caller* (enforceIpAllowlist) skips
    // the check. Here we test the lookup itself returns false for unknown IPs.
    __setIpAllowlistDepsForTests({
      ipExists: async () => false,
    })
    await expect(isIpAllowed("1.2.3.4")).resolves.toBe(false)
  })

  it("returns true when IP is present in allowlist", async () => {
    __setIpAllowlistDepsForTests({ ipExists: async () => true })
    await expect(isIpAllowed("1.2.3.4")).resolves.toBe(true)
  })

  it("fails closed (returns false) when DB throws", async () => {
    __setIpAllowlistDepsForTests({
      ipExists: async () => {
        throw new Error("db error")
      },
    })
    await expect(isIpAllowed("1.2.3.4")).resolves.toBe(false)
  })

  it("returns cached value within TTL without hitting DB again", async () => {
    const ipExists = vi.fn(async () => true)
    __setIpAllowlistDepsForTests({ ipExists })
    await isIpAllowed("5.5.5.5")
    await isIpAllowed("5.5.5.5")
    expect(ipExists).toHaveBeenCalledTimes(1)
  })
})

// ─── recordAdminLoginIp — cap enforcement ────────────────────────────────────

describe("recordAdminLoginIp", () => {
  beforeEach(() => {
    clearCaches()
  })

  it("calls upsertAllowlist with the given userId and ip", async () => {
    const upsert = vi.fn(async () => ({ inserted: false }))
    const trim = vi.fn(async () => {})
    __setIpAllowlistDepsForTests({ upsertAllowlist: upsert, trimAllowlist: trim })

    await recordAdminLoginIp("user-1", "1.2.3.4")
    expect(upsert).toHaveBeenCalledWith("user-1", "1.2.3.4")
  })

  it("calls trimAllowlist with cap=100 when the row was newly inserted", async () => {
    const trim = vi.fn(async () => {})
    __setIpAllowlistDepsForTests({
      upsertAllowlist: async () => ({ inserted: true }),
      trimAllowlist: trim,
    })

    await recordAdminLoginIp("user-1", "10.0.0.1")
    expect(trim).toHaveBeenCalledWith("user-1", 100)
  })

  it("does NOT call trimAllowlist when the row already existed (upsert update)", async () => {
    const trim = vi.fn(async () => {})
    __setIpAllowlistDepsForTests({
      upsertAllowlist: async () => ({ inserted: false }),
      trimAllowlist: trim,
    })

    await recordAdminLoginIp("user-1", "10.0.0.1")
    expect(trim).not.toHaveBeenCalled()
  })

  it("evicts the IP from cache when newly inserted", async () => {
    // Prime the cache with a stale false
    const ipExists = vi.fn(async () => false)
    __setIpAllowlistDepsForTests({ ipExists })
    await isIpAllowed("10.0.0.2") // populates cache as false

    __setIpAllowlistDepsForTests({
      ipExists: vi.fn(async () => true),
      upsertAllowlist: async () => ({ inserted: true }),
      trimAllowlist: async () => {},
    })
    await recordAdminLoginIp("user-1", "10.0.0.2")
    // Cache was cleared for this IP — next lookup should call ipExists again
    const ipExists2 = vi.fn(async () => true)
    __setIpAllowlistDepsForTests({ ipExists: ipExists2 })
    await isIpAllowed("10.0.0.2")
    expect(ipExists2).toHaveBeenCalledTimes(1)
  })
})

// ─── clearCaches ─────────────────────────────────────────────────────────────

describe("clearCaches", () => {
  it("causes next lookup to hit DB again", async () => {
    const readSetting = vi.fn(async () => "true")
    __setIpAllowlistDepsForTests({ readSetting })

    await isIpAllowlistEnabled() // fills toggle cache
    clearCaches()
    await isIpAllowlistEnabled() // should re-query

    expect(readSetting).toHaveBeenCalledTimes(2)
  })

  it("clears the IP cache so the next isIpAllowed hits DB", async () => {
    const ipExists = vi.fn(async () => true)
    __setIpAllowlistDepsForTests({ ipExists })

    await isIpAllowed("2.2.2.2")
    clearCaches()
    await isIpAllowed("2.2.2.2")

    expect(ipExists).toHaveBeenCalledTimes(2)
  })
})

// ─── logBlockedAttempt ────────────────────────────────────────────────────────

describe("logBlockedAttempt", () => {
  it("calls insertBlock with userId, ip, and path", async () => {
    const insertBlock = vi.fn(async () => {})
    __setIpAllowlistDepsForTests({ insertBlock })

    await logBlockedAttempt("user-99", "3.3.3.3", "/api/secret")
    expect(insertBlock).toHaveBeenCalledWith("user-99", "3.3.3.3", "/api/secret")
  })

  it("does not throw when insertBlock fails", async () => {
    __setIpAllowlistDepsForTests({
      insertBlock: async () => {
        throw new Error("db down")
      },
    })
    await expect(
      logBlockedAttempt("user-1", "1.1.1.1", "/test"),
    ).resolves.toBeUndefined()
  })
})
