export interface IdempotencyStore {
  get: (key: string) => Promise<string | null>
  set: (key: string, response: string, expiresAt: Date) => Promise<void>
}

const TTL_MS = 24 * 60 * 60 * 1000

export async function withIdempotency<T>(
  store: IdempotencyStore,
  key: string | null,
  handler: () => Promise<T>,
): Promise<T> {
  if (!key) return handler()

  const cached = await store.get(key)
  if (cached !== null) {
    return JSON.parse(cached) as T
  }

  const result = await handler()
  await store.set(key, JSON.stringify(result), new Date(Date.now() + TTL_MS))
  return result
}
