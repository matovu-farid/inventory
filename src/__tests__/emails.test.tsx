import { render } from '@react-email/render'
import { describe, it, expect } from 'vitest'
import {
  VerifyEmailTemplate,
  ResetPasswordTemplate,
  InviteUserTemplate,
  RequestAccessTemplate,
} from '#/lib/emails'

const APP_URL = 'https://inventory.fidexa.org'

describe('VerifyEmailTemplate', () => {
  it('includes the verify URL on the CTA and as plain text', async () => {
    const url = `${APP_URL}/api/auth/verify-email?token=abc`
    const html = await render(
      <VerifyEmailTemplate name="Sara" url={url} appUrl={APP_URL} />,
    )
    expect(html).toContain('Verify email')
    expect(html).toContain(url)
    expect(html).toContain('Hi Sara,')
    expect(html).toContain('expires in 1 hour')
  })
})

describe('ResetPasswordTemplate', () => {
  it('includes the reset URL and the warning copy', async () => {
    const url = `${APP_URL}/reset-password?token=xyz`
    const html = await render(
      <ResetPasswordTemplate name="Sara" url={url} appUrl={APP_URL} />,
    )
    expect(html).toContain('Reset password')
    expect(html).toContain(url)
    expect(html).toContain('won&#x27;t change')
  })
})

describe('InviteUserTemplate', () => {
  it('includes the inviter name and 7-day expiry', async () => {
    const url = `${APP_URL}/accept-invite?token=tok`
    const html = await render(
      <InviteUserTemplate
        name="Sara"
        inviterName="Admin Alice"
        url={url}
        appUrl={APP_URL}
      />,
    )
    expect(html).toContain('Admin Alice invited you')
    expect(html).toContain(url)
    expect(html).toContain('Set password &amp; sign in')
    expect(html).toContain('expires in 7 days')
  })
})

describe('RequestAccessTemplate', () => {
  it('includes the requester details and internal app URL', async () => {
    const message = 'We need inventory visibility for our shop.'
    const html = await render(
      <RequestAccessTemplate
        name="Sara"
        email="sara@example.com"
        message={message}
        appUrl={APP_URL}
      />,
    )

    expect(html).toContain('New access request')
    expect(html).toContain('Sara')
    expect(html).toContain('sara@example.com')
    expect(html).toContain(message)
    expect(html).toContain(APP_URL)
  })
})
