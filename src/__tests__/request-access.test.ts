import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestAccess } from '#/server/functions/request-access'
import { requestAccessInput } from '#/server/functions/request-access-input'
import { submitRequestAccess } from '#/server/functions/request-access.server'

const { sendRequestAccessEmail, reserve, clear, getRequestHeaders } =
  vi.hoisted(() => ({
    sendRequestAccessEmail: vi.fn(),
    reserve: vi.fn(),
    clear: vi.fn(),
    getRequestHeaders: vi.fn(),
  }))

vi.mock('#/lib/email', () => ({ sendRequestAccessEmail }))
vi.mock('@tanstack/react-start/server', () => ({ getRequestHeaders }))
vi.mock('#/server/runtime-context', () => ({
  getWorkerEnv: () => ({
    REQUEST_ACCESS_RATE_LIMITER: {
      getByName: () => ({ reserve, clear }),
    },
  }),
}))

const validRequest = {
  name: 'Sara',
  email: 'sara@example.com',
  message: 'We need inventory visibility for our shop.',
}

describe('request access submission', () => {
  beforeEach(() => {
    sendRequestAccessEmail.mockReset()
    reserve.mockReset()
    clear.mockReset()
    getRequestHeaders.mockReset()
    getRequestHeaders.mockReturnValue(
      new Headers({ 'CF-Connecting-IP': '203.0.113.10' }),
    )
    reserve.mockResolvedValue({ token: 'reservation-token' })
    clear.mockResolvedValue(undefined)
  })

  it('accepts valid fields after trimming whitespace', () => {
    expect(
      requestAccessInput.parse({
        name: '  Sara  ',
        email: 'sara@example.com',
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
    expect(reserve).toHaveBeenCalledWith('203.0.113.10', expect.any(Number))
    expect(clear).not.toHaveBeenCalled()
  })

  it('rejects with a generic delivery error when email delivery fails', async () => {
    sendRequestAccessEmail.mockResolvedValue(false)

    await expect(submitRequestAccess(validRequest)).rejects.toThrow(
      /Could not send access request/i,
    )
    expect(clear).toHaveBeenCalledWith('reservation-token')
  })

  it('clears the reservation when the email helper throws', async () => {
    sendRequestAccessEmail.mockRejectedValue(new Error('transport failed'))

    await expect(submitRequestAccess(validRequest)).rejects.toThrow(
      /Could not send access request/i,
    )
    expect(clear).toHaveBeenCalledWith('reservation-token')
  })

  it('uses the trusted Cloudflare client header and ignores forwarding headers', async () => {
    getRequestHeaders.mockReturnValue(
      new Headers({
        'CF-Connecting-IP': '198.51.100.4',
        'X-Forwarded-For': '192.0.2.8',
      }),
    )
    sendRequestAccessEmail.mockResolvedValue(true)

    await submitRequestAccess(validRequest)

    expect(reserve).toHaveBeenCalledWith('198.51.100.4', expect.any(Number))
  })

  it('uses the shared unknown key when Cloudflare does not provide an address', async () => {
    getRequestHeaders.mockReturnValue(
      new Headers({ 'X-Forwarded-For': '192.0.2.8' }),
    )
    sendRequestAccessEmail.mockResolvedValue(true)

    await submitRequestAccess(validRequest)

    expect(reserve).toHaveBeenCalledWith('unknown', expect.any(Number))
  })

  it('returns a generic cooldown error without sending email', async () => {
    reserve.mockResolvedValue(null)

    await expect(submitRequestAccess(validRequest)).rejects.toThrow(
      /wait a moment/i,
    )
    expect(sendRequestAccessEmail).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('keeps the original delivery failure when cleanup fails', async () => {
    sendRequestAccessEmail.mockResolvedValue(false)
    clear.mockRejectedValue(new Error('limiter unavailable'))
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      await expect(submitRequestAccess(validRequest)).rejects.toThrow(
        /Could not send access request/i,
      )
      expect(consoleError).toHaveBeenCalledWith(
        '[RequestAccess] rate-limit cleanup failed',
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('exposes the client-safe server-function wrapper', () => {
    expect(requestAccess).toBeDefined()
  })
})
