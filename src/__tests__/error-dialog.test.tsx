// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorDialog } from '#/components/error-dialog'
import { ErrorDialogProvider } from '#/components/error-dialog-provider'

afterEach(cleanup)

describe('ErrorDialog', () => {
  it('shows safe copy and calls retry', () => {
    const onRetry = vi.fn()
    render(
      <ErrorDialog
        open
        error={new Error('secret')}
        onOpenChange={() => {}}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('ErrorDialogProvider', () => {
  it('opens for an uncaught error and can be dismissed', async () => {
    render(
      <ErrorDialogProvider>
        <div>Application</div>
      </ErrorDialogProvider>,
    )

    window.dispatchEvent(
      new ErrorEvent('error', { error: new Error('secret') }),
    )

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.queryByText('secret')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
