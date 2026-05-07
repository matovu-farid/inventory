import { EmailLayout } from "./_layout"

export type ResetPasswordProps = {
  name: string
  url: string
  appUrl: string
}

export function ResetPasswordTemplate({ name, url, appUrl }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview="Reset your Inventory Management password"
      appUrl={appUrl}
      heading="Reset your password"
      greeting={`Hi ${name},`}
      intro="We got a request to reset the password for your Inventory Management account. Click below to choose a new one."
      ctaLabel="Reset password"
      ctaUrl={url}
      note="If you didn't request this, ignore this email — your password won't change."
      noteTone="warning"
    />
  )
}

export default ResetPasswordTemplate
