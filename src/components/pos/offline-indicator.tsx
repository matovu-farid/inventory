import { Loader2 } from 'lucide-react'
import { cn } from '#/lib/utils'

type Props = {
  isOnline: boolean
  queued: number
  failed: number
  onOpen: () => void
}

/**
 * Small badge in PosHeader showing connectivity and sync state.
 * - Online + queue empty: green dot only
 * - Online + queue > 0: blue spinner + "Syncing N..."
 * - Offline: orange dot + "Offline"
 * Tap opens the QueuedSalesSheet.
 */
export function OfflineIndicator({ isOnline, queued, failed, onOpen }: Props) {
  const total = queued + failed

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        !isOnline
          ? 'Offline — tap to view queued sales'
          : total > 0
            ? `${total} sale(s) pending sync — tap to view`
            : 'Online — tap to view queued sales'
      }
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        !isOnline
          ? 'bg-orange-100 text-orange-700'
          : total > 0
            ? 'bg-blue-100 text-blue-700'
            : 'bg-green-100 text-green-700',
      )}
    >
      {!isOnline ? (
        <>
          <span className="size-2 rounded-full bg-orange-500" />
          Offline
          {failed > 0 && (
            <span className="ml-0.5 rounded-full bg-orange-500 px-1 text-white">
              {failed}
            </span>
          )}
        </>
      ) : total > 0 ? (
        <>
          <Loader2 className="size-3 animate-spin" />
          Syncing {total}...
        </>
      ) : (
        <span className="size-2 rounded-full bg-green-500" />
      )}
    </button>
  )
}
