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
  Resend: vi.fn(() => ({
    emails: { send },
  })),
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
})
