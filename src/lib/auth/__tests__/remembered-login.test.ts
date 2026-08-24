// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  getHomeRedirect,
  hasSuccessfulAuth,
  hasRememberedLogin,
  markRememberedLogin,
  REMEMBERED_LOGIN_COOKIE,
} from '#/lib/auth/remembered-login'

describe('remembered login cookie', () => {
  beforeEach(() => {
    document.cookie = `${REMEMBERED_LOGIN_COOKIE}=; Max-Age=0; Path=/`
    document.cookie = `not_${REMEMBERED_LOGIN_COOKIE}=; Max-Age=0; Path=/`
  })

  it('starts absent', () => {
    expect(hasRememberedLogin()).toBe(false)
  })

  it('writes and reads the remembered-login cookie', () => {
    markRememberedLogin()
    expect(document.cookie).toContain(`${REMEMBERED_LOGIN_COOKIE}=1`)
    expect(hasRememberedLogin()).toBe(true)
  })

  it('does not treat a similarly named cookie as a match', () => {
    document.cookie = `not_${REMEMBERED_LOGIN_COOKIE}=1; Path=/`
    expect(hasRememberedLogin()).toBe(false)
  })

  it.each([
    [true, false, '/'],
    [false, true, '/login'],
    [false, false, null],
  ] as const)(
    'returns the correct /home redirect for session=%s remembered=%s',
    (hasSession, remembered, expected) => {
      expect(
        getHomeRedirect({ hasSession, hasRememberedLogin: remembered }),
      ).toBe(expected)
    },
  )

  it('only treats auth results without an error as successful', () => {
    expect(hasSuccessfulAuth({})).toBe(true)
    expect(hasSuccessfulAuth({ error: null })).toBe(true)
    expect(hasSuccessfulAuth({ error: { message: 'Invalid password' } })).toBe(
      false,
    )
  })
})
