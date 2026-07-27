import * as React from 'react'
import { recordSale } from '#/server/functions/shop/sales'
import {
  getQueuedSales,
  deleteQueuedSale,
  updateQueuedSaleStatus,
} from '#/lib/offline/idb'
import { useOnline } from '#/lib/offline/use-online'

export type SyncCounts = { queued: number; failed: number }

// Module-level mutex: prevents concurrent drains across multiple hook instances
let isSyncing = false

/** Reset sync mutex — only for use in tests. */
export function _resetSyncMutex() {
  isSyncing = false
}

async function drainQueue(): Promise<void> {
  if (isSyncing) return
  isSyncing = true

  try {
    const all = await getQueuedSales()
    const pending = all.filter(
      (s) => s.status === 'queued' || s.status === 'syncing',
    )

    for (const sale of pending) {
      // Mark as syncing so we can detect in-flight entries on crash
      await updateQueuedSaleStatus(sale.id, 'syncing', null)

      try {
        await recordSale({
          data: sale.payload as Parameters<typeof recordSale>[0]['data'],
        })
        await deleteQueuedSale(sale.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)

        const isNetworkError =
          err instanceof TypeError ||
          message.toLowerCase().includes('failed to fetch') ||
          message.toLowerCase().includes('network') ||
          message.toLowerCase().includes('load failed')

        if (isNetworkError) {
          // Reset to queued so it gets retried next time
          await updateQueuedSaleStatus(sale.id, 'queued', null)
          // Network is down — stop draining; we'll retry when online again
          break
        } else {
          // Business/validation error — mark permanently failed
          await updateQueuedSaleStatus(sale.id, 'failed', message)
        }
      }
    }
  } finally {
    isSyncing = false
  }
}

/**
 * Hook used once in PosInner. Subscribes to online state and drains the
 * IDB queue whenever connectivity is (re-)established. Returns live counts
 * of pending and failed sales so UI components can react.
 */
export function useSyncEngine(): SyncCounts & { refresh: () => Promise<void> } {
  const isOnline = useOnline()
  const [counts, setCounts] = React.useState<SyncCounts>({
    queued: 0,
    failed: 0,
  })

  async function refreshCounts() {
    try {
      const all = await getQueuedSales()
      setCounts({
        queued: all.filter(
          (s) => s.status === 'queued' || s.status === 'syncing',
        ).length,
        failed: all.filter((s) => s.status === 'failed').length,
      })
    } catch {
      // IDB unavailable — no-op
    }
  }

  // Drain on mount (if already online) and on each online transition
  const wasOnlineRef = React.useRef<boolean | null>(null)

  React.useEffect(() => {
    const wasOnline = wasOnlineRef.current
    wasOnlineRef.current = isOnline

    if (isOnline && wasOnline !== true) {
      // Just came online (or first mount)
      void drainQueue().then(() => refreshCounts())
    } else {
      void refreshCounts()
    }
  }, [isOnline])

  // Periodic refresh so counts stay accurate after background sync
  React.useEffect(() => {
    const id = setInterval(() => {
      void refreshCounts()
    }, 5_000)
    return () => clearInterval(id)
  }, [])

  return { ...counts, refresh: refreshCounts }
}
