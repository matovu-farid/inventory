import { describe, expect, it, vi } from 'vitest'

import {
  createRouteErrorReporter,
  getErrorDiagnostics,
  getSafeErrorMessage,
} from '#/lib/error-handling'

describe('getErrorDiagnostics', () => {
  it('returns message and stack only when development diagnostics are enabled', () => {
    const error = new Error('local failure')
    error.stack = 'Error: local failure\n    at test.ts:1:1'

    expect(getErrorDiagnostics(error, true)).toEqual({
      message: 'local failure',
      stack: 'Error: local failure\n    at test.ts:1:1',
    })
    expect(getErrorDiagnostics(error, false)).toBeNull()
    expect(getErrorDiagnostics(undefined, true)).toEqual({
      message: 'undefined',
      stack: '',
    })
  })
})

describe('getSafeErrorMessage', () => {
  it('uses the fallback for unknown and raw thrown values', () => {
    expect(getSafeErrorMessage({ message: 'database password=secret' })).toBe(
      'Something went wrong. Please try again.',
    )
    expect(getSafeErrorMessage('network failure')).toBe(
      'Something went wrong. Please try again.',
    )
  })

  it('allows an explicitly supplied safe message', () => {
    expect(
      getSafeErrorMessage(
        new Error('internal detail'),
        'Could not save this item.',
      ),
    ).toBe('Could not save this item.')
  })
})

describe('createRouteErrorReporter', () => {
  it('reports the original error with React error info', () => {
    const captureException = vi.fn()
    const reporter = createRouteErrorReporter(captureException)
    const error = new Error('route failed')
    const errorInfo = { componentStack: '\n    at BrokenRoute' }

    reporter(error, errorInfo)

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException).toHaveBeenCalledWith(error, errorInfo)
  })
})
