import { Resend } from 'resend'
import { env } from '#/env'
import {
  VerifyEmailTemplate,
  ResetPasswordTemplate,
  InviteUserTemplate,
  LowStockDigestTemplate,
  RequestAccessTemplate,
} from '#/lib/emails'
import type { LowStockDigestData } from '#/lib/emails'

const MOCK_EMAILS = env.MOCK_EMAILS === 'true'
const resend = new Resend(env.RESEND_API_KEY)

const FROM = env.EMAIL_FROM ?? 'Inventory Management <noreply@fidexa.org>'
const APP_URL = env.APP_URL

type VerifyArgs = { to: string; name: string; url: string }
type ResetArgs = { to: string; name: string; url: string }
type InviteArgs = {
  to: string
  name: string
  inviterName: string
  url: string
}

// Test-mode short-circuit: when MOCK_EMAILS=true the Resend SDK is never
// called. Set in .env.test and in the CI test/e2e jobs so Cypress runs do
// not consume real Resend quota or harm sender reputation by bouncing
// against synthetic @test.com addresses.
function skipForTest(kind: string, to: string): boolean {
  if (!MOCK_EMAILS) return false
  console.log(`[Email:mock] ${kind} -> ${to}`)
  return true
}

export async function sendVerificationEmail({ to, name, url }: VerifyArgs) {
  if (skipForTest('verify', to)) return
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Verify your email — Inventory Management',
      react: VerifyEmailTemplate({ name, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error('[Email] sendVerificationEmail failed:', error)
  }
}

export async function sendPasswordResetEmail({ to, name, url }: ResetArgs) {
  if (skipForTest('reset', to)) return
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Reset your password — Inventory Management',
      react: ResetPasswordTemplate({ name, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error('[Email] sendPasswordResetEmail failed:', error)
  }
}

export async function sendInviteEmail({
  to,
  name,
  inviterName,
  url,
}: InviteArgs) {
  if (skipForTest('invite', to)) return
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${inviterName} invited you to Inventory Management`,
      react: InviteUserTemplate({ name, inviterName, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error('[Email] sendInviteEmail failed:', error)
  }
}

type DigestArgs = { to: string; data: LowStockDigestData }
export async function sendLowStockDigest({ to, data }: DigestArgs) {
  if (skipForTest('low-stock-digest', to)) return
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `Low-stock digest — ${data.storeLowCount + data.shopLowCount} items need attention`,
      react: LowStockDigestTemplate(data),
    })
  } catch (error) {
    console.error('[Email] sendLowStockDigest failed:', error)
  }
}

type RequestAccessArgs = {
  name: string
  email: string
  message: string
}

export async function sendRequestAccessEmail({
  name,
  email,
  message,
}: RequestAccessArgs) {
  if (skipForTest('request-access', email)) return true

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: (env as typeof env & { REQUEST_ACCESS_EMAIL: string })
        .REQUEST_ACCESS_EMAIL,
      subject: `New access request — ${name}`,
      react: RequestAccessTemplate({ name, email, message, appUrl: APP_URL }),
    })

    if (result.error) {
      console.error('[Email] sendRequestAccessEmail failed:', result.error)
      return false
    }

    return true
  } catch (error) {
    console.error('[Email] sendRequestAccessEmail failed:', error)
    return false
  }
}
