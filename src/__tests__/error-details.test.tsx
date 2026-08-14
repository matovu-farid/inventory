// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorDetails } from '#/components/error-details'

afterEach(cleanup)

describe('ErrorDetails', () => {
  it('keeps diagnostics hidden until expanded and copies message and stack', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const error = new Error('local failure')
    error.stack = 'Error: local failure\n    at test.ts:1:1'

    render(<ErrorDetails error={error} development />)

    expect(screen.queryByText('local failure')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show error details' }))
    expect(screen.getByText('local failure')).toBeTruthy()
    expect(screen.getByText(/at test\.ts:1:1/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy stack' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    expect(writeText).toHaveBeenNthCalledWith(1, 'local failure')
    expect(writeText).toHaveBeenNthCalledWith(
      2,
      'Error: local failure\n    at test.ts:1:1',
    )
  })

  it('renders nothing when diagnostics are disabled', () => {
    render(
      <ErrorDetails
        error={new Error('production detail')}
        development={false}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Show error details' }),
    ).toBeNull()
    expect(screen.queryByText('production detail')).toBeNull()
  })
})
