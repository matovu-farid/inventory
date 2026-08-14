import type { ErrorInfo } from 'react'

export const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export interface ErrorDiagnostics {
  message: string
  stack: string
}

export function getSafeErrorMessage(
  _error: unknown,
  safeMessage = DEFAULT_ERROR_MESSAGE,
): string {
  return safeMessage.trim() || DEFAULT_ERROR_MESSAGE
}

export function getErrorDiagnostics(
  error: unknown,
  development = import.meta.env.DEV,
): ErrorDiagnostics | null {
  if (!development) return null

  if (error instanceof Error) {
    return {
      message: error.message || DEFAULT_ERROR_MESSAGE,
      stack: error.stack ?? '',
    }
  }

  if (typeof error === 'string') {
    return { message: error, stack: '' }
  }

  try {
    const serialized = JSON.stringify(error) as string | undefined
    return {
      message: typeof serialized === 'string' ? serialized : String(error),
      stack: '',
    }
  } catch {
    return { message: String(error), stack: '' }
  }
}

export function createRouteErrorReporter(
  captureException: (error: Error, errorInfo: ErrorInfo) => void,
) {
  return (error: Error, errorInfo: ErrorInfo): void => {
    captureException(error, errorInfo)
  }
}
