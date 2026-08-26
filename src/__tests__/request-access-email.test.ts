import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@react-email/render'
import { sendRequestAccessEmail } from '#/lib/email'

const { send } = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock('#/env', () => ({
  env: {
    REQUEST_ACCESS_EMAIL: 'owner@example.com',
    MOCK_EMAILS: 'false',
    RESEND_API_KEY: 're_test_key',
    EMAIL_FROM: 'Inventory Management <noreply@example.com>',
    APP_URL: 'https://inventory.example.com',
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const request = {
  name: 'Sara',
  email: 'sara@example.com',
  message: 'We need inventory visibility for our shop.',
}

describe('sendRequestAccessEmail', () => {
  beforeEach(() => {
    send.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('sends requester details to the configured owner', async () => {
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    await expect(sendRequestAccessEmail(request)).resolves.toBe(true)

    expect(send).toHaveBeenCalledOnce()
    const options = send.mock.calls[0][0]
    expect(options).toMatchObject({
      from: 'Inventory Management <noreply@example.com>',
      to: 'owner@example.com',
      subject: 'New access request — Sara',
    })
    const html = await render(options.react)
    expect(html).toContain(request.name)
    expect(html).toContain(request.email)
    expect(html).toContain(request.message)
    expect(html).toContain('https://inventory.example.com')
  })

  it('returns false when Resend reports an error', async () => {
    send.mockResolvedValue({ error: new Error('Resend rejected the email') })

    await expect(sendRequestAccessEmail(request)).resolves.toBe(false)
  })

  it('returns false when the email transport throws', async () => {
    send.mockImplementation(() => {
      throw new Error('Network unavailable')
    })

    const result = await sendRequestAccessEmail(request)
    expect(result).toBe(false)
  })

  it('escapes hostile requester messages in the rendered email', async () => {
    const hostileMessage = '<img src=x onerror=alert(1)>'
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    await expect(
      sendRequestAccessEmail({ ...request, message: hostileMessage }),
    ).resolves.toBe(true)

    const options = send.mock.calls[0][0]
    const html = await render(options.react)
    expect(html).not.toContain(hostileMessage)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('sendRequestAccessEmail mock mode', () => {
  it('logs only a fixed event without requester PII', async () => {
    vi.resetModules()
    vi.doMock('#/env', () => ({
      env: {
        REQUEST_ACCESS_EMAIL: 'owner@example.com',
        MOCK_EMAILS: 'true',
        RESEND_API_KEY: 're_test_key',
        EMAIL_FROM: 'Inventory Management <noreply@example.com>',
        APP_URL: 'https://inventory.example.com',
      },
    }))
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      const { sendRequestAccessEmail: sendMockRequestAccessEmail } =
        await import('#/lib/email')
      await expect(
        sendMockRequestAccessEmail({
          name: 'Private Requester',
          email: 'private@example.com',
          message: 'Private message',
        }),
      ).resolves.toBe(true)
      expect(log).toHaveBeenCalledWith('[Email:mock] request-access')
      expect(log.mock.calls.flat().join(' ')).not.toMatch(
        /Private Requester|private@example\.com|Private message|owner@example\.com/,
      )
    } finally {
      log.mockRestore()
      vi.doUnmock('#/env')
      vi.resetModules()
    }
  })
})
