// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestAccessDialog } from '#/components/request-access-dialog'

const { requestAccess } = vi.hoisted(() => ({
  requestAccess: vi.fn(),
}))

vi.mock('#/server/functions/request-access', () => ({ requestAccess }))

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
      const status = await screen.findByRole('status')
      expect(status.textContent).toMatch(/request sent/i)
    } finally {
      resolveRequest()
    }
  })

  it('shows a generic delivery error and keeps the dialog open', async () => {
    requestAccess.mockRejectedValueOnce(new Error('SMTP credentials leaked'))

    openRequestAccessDialog()
    fillRequestAccessForm()
    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() => expect(requestAccess).toHaveBeenCalledOnce())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/unable to deliver/i)
    expect(alert.textContent).not.toContain('SMTP credentials leaked')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('ignores a delivery result after closing and reopening the dialog', async () => {
    let resolveRequest: () => void = () => undefined
    requestAccess.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve
      }),
    )

    openRequestAccessDialog()
    fillRequestAccessForm()
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(requestAccess).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /^request access$/i }))

    await act(async () => {
      resolveRequest()
      await Promise.resolve()
    })

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores a pending delivery result after the dialog unmounts', async () => {
    let rejectRequest: (error: Error) => void = () => undefined
    const pendingRequest = new Promise<void>((_, reject) => {
      rejectRequest = reject
    })
    requestAccess.mockReturnValue(pendingRequest)

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const consoleWarn = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)

    try {
      const { unmount } = render(<RequestAccessDialog />)
      fireEvent.click(screen.getByRole('button', { name: /^request access$/i }))
      fillRequestAccessForm()
      fireEvent.submit(screen.getByRole('form'))
      await waitFor(() => expect(requestAccess).toHaveBeenCalledOnce())

      unmount()

      await act(async () => {
        rejectRequest(new Error('SMTP credentials leaked'))
        await pendingRequest.catch(() => undefined)
      })

      expect(consoleError).not.toHaveBeenCalled()
      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    }
  })

  it('rejects whitespace-only name and message before delivery', async () => {
    openRequestAccessDialog()
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: requestData.email },
    })
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: ' \n\t' },
    })

    fireEvent.submit(screen.getByRole('form'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/name and message/i)
    expect(requestAccess).not.toHaveBeenCalled()
  })

  it('trims name and message before delivery', async () => {
    requestAccess.mockResolvedValueOnce(undefined)

    openRequestAccessDialog()
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: `  ${requestData.name}  ` },
    })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: `  ${requestData.email}  ` },
    })
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: `  ${requestData.message}  ` },
    })

    fireEvent.submit(screen.getByRole('form'))

    await waitFor(() =>
      expect(requestAccess).toHaveBeenCalledWith({ data: requestData }),
    )
  })

  it('opens an explanatory dialog without submitting data', async () => {
    openRequestAccessDialog()

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Message')).toBeTruthy()
    expect(screen.getByLabelText('Name').getAttribute('autocomplete')).toBe(
      'name',
    )
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe(
      'email',
    )
    expect(
      screen.getByText(/administrator must provide an invite/i),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
