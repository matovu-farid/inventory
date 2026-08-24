export const REMEMBERED_LOGIN_COOKIE = 'inventory_has_logged_in'

const REMEMBERED_LOGIN_MAX_AGE = 60 * 60 * 24 * 365

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
