export const REMEMBERED_LOGIN_COOKIE = 'inventory_has_logged_in'

const REMEMBERED_LOGIN_MAX_AGE = 60 * 60 * 24 * 365

export function getRootRedirect({
  hasSession,
  hasRememberedLogin: rememberedLogin,
}: {
  hasSession: boolean
  hasRememberedLogin: boolean
}): '/login' | '/home' | null {
  if (hasSession) return null
  if (rememberedLogin) return '/login'
  return '/home'
}

export function hasSuccessfulAuth(result: { error?: unknown }) {
  return !result.error
}

export function markRememberedLogin() {
  if (typeof document === 'undefined') return

  document.cookie = `${REMEMBERED_LOGIN_COOKIE}=1; Max-Age=${REMEMBERED_LOGIN_MAX_AGE}; Path=/; SameSite=Lax`
}

export function hasRememberedLogin() {
  if (typeof document === 'undefined') return false

  return document.cookie.split(';').some((cookie) => {
    const [name, value] = cookie.trim().split('=')
    return name === REMEMBERED_LOGIN_COOKIE && value === '1'
  })
}
