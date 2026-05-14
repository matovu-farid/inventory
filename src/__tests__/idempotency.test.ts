import { describe, it, expect, vi } from "vitest"
import { withIdempotency  } from "#/server/middleware/idempotency"
import type {IdempotencyStore} from "#/server/middleware/idempotency";

function makeMemoryStore(): IdempotencyStore {
  const map = new Map<string, { response: string; expiresAt: Date }>()
  return {
    get(key) {
      const row = map.get(key)
      if (!row || row.expiresAt < new Date()) return Promise.resolve(null)
      return Promise.resolve(row.response)
    },
    set(key, response, expiresAt) {
      map.set(key, { response, expiresAt })
      return Promise.resolve()
    },
  }
}

describe("withIdempotency", () => {
  it("executes the handler when no key is provided", async () => {
    const handler = vi.fn().mockResolvedValue({ id: "1" })
    const result = await withIdempotency(makeMemoryStore(), null, handler)
    expect(result).toEqual({ id: "1" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("executes the handler the first time a key is seen", async () => {
    const store = makeMemoryStore()
    const handler = vi.fn().mockResolvedValue({ id: "1" })
    const result = await withIdempotency(store, "key-1", handler)
    expect(result).toEqual({ id: "1" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("returns the cached response on a duplicate key without re-running the handler", async () => {
    const store = makeMemoryStore()
    const handler = vi.fn().mockResolvedValue({ id: "1" })
    await withIdempotency(store, "key-1", handler)
    const result = await withIdempotency(store, "key-1", handler)
    expect(result).toEqual({ id: "1" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("re-executes the handler if the cached entry has expired", async () => {
    const map = new Map<string, { response: string; expiresAt: Date }>()
    map.set("key-1", { response: JSON.stringify({ id: "old" }), expiresAt: new Date(Date.now() - 1000) })
    const store: IdempotencyStore = {
      get(key) {
        const row = map.get(key)
        if (!row || row.expiresAt < new Date()) return Promise.resolve(null)
        return Promise.resolve(row.response)
      },
      set(key, response, expiresAt) {
        map.set(key, { response, expiresAt })
        return Promise.resolve()
      },
    }
    const handler = vi.fn().mockResolvedValue({ id: "new" })
    const result = await withIdempotency(store, "key-1", handler)
    expect(result).toEqual({ id: "new" })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("serializes complex responses correctly across calls", async () => {
    const store = makeMemoryStore()
    const original = { id: "1", nested: { value: 42 }, list: [1, 2, 3] }
    const handler = vi.fn().mockResolvedValue(original)
    await withIdempotency(store, "key-1", handler)
    const cached = await withIdempotency(store, "key-1", handler)
    expect(cached).toEqual(original)
  })

  it("uses a 24-hour TTL by default", async () => {
    const setMock = vi.fn().mockResolvedValue(undefined)
    const store: IdempotencyStore = {
      get() {
        return Promise.resolve(null)
      },
      set: setMock,
    }
    const before = Date.now()
    await withIdempotency(store, "key-1", () => Promise.resolve({ id: "1" }))
    const expiresAt = setMock.mock.calls[0][2] as Date
    const ttlMs = expiresAt.getTime() - before
    expect(ttlMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000)
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000)
  })
})
