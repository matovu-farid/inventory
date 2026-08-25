// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { requestAccess } = vi.hoisted(() => ({
  requestAccess: vi.fn(),
}))

vi.mock('#/server/functions/request-access', () => ({ requestAccess }))

import { RequestAccessDialog } from '#/components/request-access-dialog'

afterEach(cleanup)
beforeEach(() => {
  requestAccess.mockReset()
})

const requestData = {
  name: 'Sara',
  email: 'sara@example.com',
  message: 'We need inventory visibility for our shop.',
}

function fillRequestAccessForm() {
  fireEvent.change(screen.getByLabelText('Name'), {
    target: { value: requestData.name },
  })
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: requestData.email },
  })
  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: requestData.message },
  })
}

function openRequestAccessDialog() {
  render(<RequestAccessDialog />)
  fireEvent.click(screen.getByRole('button', { name: /^request access$/i }))
}

describe('RequestAccessDialog', () => {
  it('submits the requester fields and shows success after delivery', async () => {
    let resolveRequest: () => void = () => undefined
    requestAccess.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve
      }),
    )

    openRequestAccessDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    fillRequestAccessForm()

    try {
      const form = screen.getByRole('form')
      const submitButton = form.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement
      expect(submitButton).toBeTruthy()

      fireEvent.submit(form)

      expect(requestAccess).toHaveBeenCalledWith({ data: requestData })
      expect(submitButton).toHaveProperty('disabled', true)

      resolveRequest()
      expect(await screen.findByRole('status')).toHaveTextContent(
        /request sent/i,
      )
    } finally {
      resolveRequest()
    }
  })

  it('shows a generic delivery error and keeps the dialog open', async () => {
    let rejectRequest: (error: Error) => void = () => undefined
    requestAccess.mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectRequest = reject
        }),
    )

    openRequestAccessDialog()
    fillRequestAccessForm()
    fireEvent.submit(screen.getByRole('form'))
    rejectRequest(new Error('SMTP credentials leaked'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /unable to deliver/i,
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('opens an explanatory dialog without submitting data', async () => {
    openRequestAccessDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(
      screen.getByText(/administrator must provide an invite/i),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
