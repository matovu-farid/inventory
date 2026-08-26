import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import type { RequestAccessRateLimiter } from '#/server/durable-objects/request-access-rate-limiter'

const limiterNamespace = (
  env as unknown as {
    REQUEST_ACCESS_RATE_LIMITER: DurableObjectNamespace<RequestAccessRateLimiter>
  }
).REQUEST_ACCESS_RATE_LIMITER

function limiter() {
  return limiterNamespace.getByName('request-access-integration')
}

describe('RequestAccessRateLimiter in Workers', () => {
  it('reserves once per client, expires, and respects token ownership', async () => {
    const stub = limiter()
    const now = 1_000_000
    const first = await stub.reserve('198.51.100.1', now)
    expect(first).toEqual({ token: expect.any(String) })
    expect(await stub.reserve('198.51.100.1', now + 1_000)).toBeNull()

    await stub.clear('wrong-token')
    expect(await stub.reserve('198.51.100.1', now + 1_000)).toBeNull()

    if (!first) throw new Error('Expected first reservation')
    await stub.clear(first.token)
    expect(await stub.reserve('198.51.100.1', now + 1_000)).toEqual({
      token: expect.any(String),
    })

    expect(await stub.reserve('198.51.100.1', now + 61_001)).toEqual({
      token: expect.any(String),
    })
  })

  it('enforces the global interval for clients without a trusted IP', async () => {
    const stub = limiter()
    const now = 2_000_000
    expect(await stub.reserve('unknown', now)).toEqual({
      token: expect.any(String),
    })
    expect(await stub.reserve('198.51.100.2', now + 1_000)).toBeNull()
    expect(await stub.reserve('198.51.100.2', now + 5_001)).toEqual({
      token: expect.any(String),
    })
  })

  it('serializes concurrent reservations for the same client', async () => {
    const stub = limiter()
    const results = await Promise.all(
      Array.from({ length: 8 }, () => stub.reserve('198.51.100.3', 3_000_000)),
    )

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(
      results.filter((value: { token: string } | null) => value === null),
    ).toHaveLength(7)
  })
})
