import { describe, expect, it } from 'vitest'
import { getWorkerEnv, withWorkerEnv } from '#/server/runtime-context'

const firstEnv = {
  REQUEST_ACCESS_RATE_LIMITER: {} as never,
}
const secondEnv = {
  REQUEST_ACCESS_RATE_LIMITER: {} as never,
}

describe('worker runtime context', () => {
  it('rejects access outside a request', () => {
    expect(() => getWorkerEnv()).toThrow(/outside a request/i)
  })

  it('keeps nested and asynchronous contexts isolated', async () => {
    await withWorkerEnv(firstEnv, async () => {
      expect(getWorkerEnv()).toBe(firstEnv)
      await Promise.resolve()
      withWorkerEnv(secondEnv, () => {
        expect(getWorkerEnv()).toBe(secondEnv)
      })
      expect(getWorkerEnv()).toBe(firstEnv)
    })

    expect(() => getWorkerEnv()).toThrow(/outside a request/i)
  })
})
