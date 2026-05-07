import { Resend } from "resend"
import { env } from "#/env"
import {
  VerifyEmailTemplate,
  ResetPasswordTemplate,
  InviteUserTemplate,
} from "#/lib/emails"

const resend = new Resend(env.RESEND_API_KEY)

const FROM = env.EMAIL_FROM ?? "Inventory Management <noreply@fidexa.org>"
const APP_URL = env.APP_URL

type VerifyArgs = { to: string; name: string; url: string }
type ResetArgs = { to: string; name: string; url: string }
type InviteArgs = {
  to: string
  name: string
  inviterName: string
  url: string
}

export async function sendVerificationEmail({ to, name, url }: VerifyArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Verify your email — Inventory Management",
      react: VerifyEmailTemplate({ name, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error("[Email] sendVerificationEmail failed:", error)
  }
}

export async function sendPasswordResetEmail({ to, name, url }: ResetArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Reset your password — Inventory Management",
      react: ResetPasswordTemplate({ name, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error("[Email] sendPasswordResetEmail failed:", error)
  }
}

export async function sendInviteEmail({
  to,
  name,
  inviterName,
  url,
}: InviteArgs) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: `${inviterName} invited you to Inventory Management`,
      react: InviteUserTemplate({ name, inviterName, url, appUrl: APP_URL }),
    })
  } catch (error) {
    console.error("[Email] sendInviteEmail failed:", error)
  }
}
