import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendRequestAccessEmail } = vi.hoisted(() => ({
  sendRequestAccessEmail: vi.fn(),
}))

vi.mock('#/lib/email', () => ({ sendRequestAccessEmail }))

import {
  requestAccessInput,
  submitRequestAccess,
} from '#/server/functions/request-access'

const validRequest = {
  name: 'Sara',
  email: 'sara@example.com',
  message: 'We need inventory visibility for our shop.',
}

describe('request access submission', () => {
  beforeEach(() => sendRequestAccessEmail.mockReset())

  it('accepts valid fields after trimming whitespace', () => {
    expect(
      requestAccessInput.parse({
        name: '  Sara  ',
        email: ' sara@example.com ',
        message: '  We need inventory visibility for our shop.  ',
      }),
    ).toEqual(validRequest)
  })

  it('rejects a blank name', () => {
    expect(() =>
      requestAccessInput.parse({ ...validRequest, name: '   ' }),
    ).toThrow()
  })

  it('rejects an invalid email', () => {
    expect(() =>
      requestAccessInput.parse({ ...validRequest, email: 'not-an-email' }),
    ).toThrow()
  })

  it('rejects a blank message', () => {
    expect(() =>
      requestAccessInput.parse({ ...validRequest, message: '   ' }),
    ).toThrow()
  })

  it('sends a valid submission to the email helper', async () => {
    sendRequestAccessEmail.mockResolvedValue(true)

    await submitRequestAccess(validRequest)

    expect(sendRequestAccessEmail).toHaveBeenCalledWith(validRequest)
  })

  it('rejects with a generic delivery error when email delivery fails', async () => {
    sendRequestAccessEmail.mockResolvedValue(false)

    await expect(submitRequestAccess(validRequest)).rejects.toThrow(
      /unable to deliver/i,
    )
  })
})
