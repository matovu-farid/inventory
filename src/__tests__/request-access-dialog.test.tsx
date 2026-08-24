// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RequestAccessDialog } from '#/components/request-access-dialog'

afterEach(cleanup)

describe('RequestAccessDialog', () => {
  it('opens an explanatory dialog without submitting data', async () => {
    render(<RequestAccessDialog />)

    fireEvent.click(screen.getByRole('button', { name: /request access/i }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.getByRole('button', { name: /coming soon/i })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      screen.getByText(/administrator must provide an invite/i),
    ).toBeTruthy()

    fireEvent.submit(screen.getByRole('form'))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
