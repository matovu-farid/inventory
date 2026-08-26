import { describe, expect, it, vi } from 'vitest'
import { getRequestAccessClientKey } from '#/server/functions/request-access.server'

vi.mock('#/lib/email', () => ({ sendRequestAccessEmail: vi.fn() }))
vi.mock('@tanstack/react-start/server', () => ({
  getRequestHeaders: vi.fn(),
}))
vi.mock('#/server/runtime-context', () => ({
  getWorkerEnv: vi.fn(),
}))

describe('request access rate-limit identity', () => {
  it('uses only a trusted Cloudflare connecting IP', () => {
    expect(
      getRequestAccessClientKey(
        new Headers({
          'CF-Connecting-IP': ' 198.51.100.9 ',
          'X-Forwarded-For': '192.0.2.9',
        }),
      ),
    ).toBe('198.51.100.9')
  })

  it('uses the shared unknown key when no trusted IP exists', () => {
    expect(
      getRequestAccessClientKey(
        new Headers({ 'X-Forwarded-For': '192.0.2.9' }),
      ),
    ).toBe('unknown')
  })
})
