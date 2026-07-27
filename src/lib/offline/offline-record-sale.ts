import { recordSale } from '#/server/functions/shop/sales'
import {
  putQueuedSale,
  deleteQueuedSale,
  updateQueuedSaleStatus,
} from '#/lib/offline/idb'
import type { QueuedSale } from '#/lib/offline/idb'

export type SubmitResult =
  | { ok: true; mode: 'online'; saleId: string }
  | { ok: true; mode: 'queued'; localId: string }
  | { ok: false; mode: 'queued'; localId: string; reason: string }

function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Submits a sale with offline awareness.
 *
 * If online: tries the server immediately. On success, the IDB entry is
 * cleaned up. On a network error, the entry stays queued for later sync.
 * On a business/validation error, the entry is marked failed so the
 * salesman can see it under "Needs attention".
 *
 * If offline: the entry is saved to IDB and the caller gets { mode: "queued" }.
 */
export async function submitSaleOfflineAware(
  input: Parameters<typeof recordSale>[0]['data'] & Record<string, unknown>,
): Promise<SubmitResult> {
  const localId = generateLocalId()

  const queued: QueuedSale = {
    id: localId,
    shopId: (input as { shopId: string }).shopId,
    createdAt: Date.now(),
    payload: input,
    status: 'queued',
    failureReason: null,
    attemptCount: 0,
  }

  // Always persist first so nothing is lost
  await putQueuedSale(queued)

  if (!navigator.onLine) {
    return { ok: true, mode: 'queued', localId }
  }

  // Attempt immediate sync
  try {
    const res = await recordSale({ data: input })
    // Success — remove from queue
    await deleteQueuedSale(localId)
    return { ok: true, mode: 'online', saleId: res.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Distinguish network errors (TypeError / no response) from business errors
    const isNetworkError =
      err instanceof TypeError ||
      message.toLowerCase().includes('failed to fetch') ||
      message.toLowerCase().includes('network') ||
      message.toLowerCase().includes('load failed')

    if (isNetworkError) {
      // Keep queued for sync engine to retry
      return { ok: true, mode: 'queued', localId }
    }

    // Business / validation error — mark as failed so salesman can review
    await updateQueuedSaleStatus(localId, 'failed', message)
    return { ok: false, mode: 'queued', localId, reason: message }
  }
}
