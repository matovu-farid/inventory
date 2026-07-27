import * as React from 'react'

const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_URL = '/api/auth/get-session'

/**
 * Returns true when the browser believes it's online AND a background heartbeat
 * ping confirms connectivity (catches captive portals and broken uplinks).
 */
export function useOnline(): boolean {
  const [isOnline, setIsOnline] = React.useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }
    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Heartbeat: confirms real connectivity every 30s
    async function heartbeat() {
      try {
        const res = await fetch(HEARTBEAT_URL, {
          method: 'GET',
          cache: 'no-store',
          // Short timeout so a hanging connection doesn't block indefinitely
          signal: AbortSignal.timeout(8_000),
        })
        setIsOnline(res.ok || res.status < 500)
      } catch {
        setIsOnline(false)
      }
    }

    // Initial heartbeat to check real state right away
    void heartbeat()
    const intervalId = setInterval(() => {
      void heartbeat()
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
    }
  }, [])

  return isOnline
}
