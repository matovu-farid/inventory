import { useEffect, useState } from 'react'

import { ErrorDialog } from '#/components/error-dialog'

interface ErrorDialogState {
  error: unknown
}

function isResizeObserverNotification(event: ErrorEvent) {
  const message =
    event.message.trim() ||
    (event.error instanceof Error ? event.error.message.trim() : '')
  return /^ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/i.test(
    message,
  )
}

export function ErrorDialogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = useState<ErrorDialogState | null>(null)

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (isResizeObserverNotification(event)) return
      if (!event.defaultPrevented) setState({ error: event.error })
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (!event.defaultPrevented) setState({ error: event.reason })
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return (
    <>
      {children}
      <ErrorDialog
        open={state !== null}
        error={state?.error}
        onOpenChange={(open) => {
          if (!open) setState(null)
        }}
        onRetry={() => window.location.reload()}
      />
    </>
  )
}
