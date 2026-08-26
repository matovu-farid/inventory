import { getRequestHeaders } from '@tanstack/react-start/server'
import { sendRequestAccessEmail } from '#/lib/email'
import { getWorkerEnv } from '#/server/runtime-context'
import type { RequestAccessInput } from './request-access-input'

const RATE_LIMITER_NAME = 'request-access'
const COOLDOWN_ERROR = 'Please wait a moment before trying again.'
const DELIVERY_ERROR = 'Could not send access request'

export function getRequestAccessClientKey(headers: Headers): string {
  return headers.get('CF-Connecting-IP')?.trim() || 'unknown'
}

export async function submitRequestAccess(
  data: RequestAccessInput,
): Promise<{ ok: true }> {
  const clientKey = getRequestAccessClientKey(getRequestHeaders())
  const limiter =
    getWorkerEnv().REQUEST_ACCESS_RATE_LIMITER.getByName(RATE_LIMITER_NAME)
  const reservation = await limiter.reserve(clientKey, Date.now())

  if (!reservation) {
    throw new Error(COOLDOWN_ERROR)
  }

  try {
    const sent = await sendRequestAccessEmail(data)
    if (sent === false) throw new Error(DELIVERY_ERROR)
    return { ok: true as const }
  } catch {
    try {
      await limiter.clear(reservation.token)
    } catch {
      console.error('[RequestAccess] rate-limit cleanup failed')
    }
    throw new Error(DELIVERY_ERROR)
  }
}
