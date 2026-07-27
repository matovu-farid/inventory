import { EmailLayout } from './_layout'

export type VerifyEmailProps = {
  name: string
  url: string
  appUrl: string
}

export function VerifyEmailTemplate({ name, url, appUrl }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview="Verify your email for Inventory Management"
      appUrl={appUrl}
      heading="Verify your email"
      greeting={`Hi ${name},`}
      intro="Thanks for creating your Inventory Management account — confirm your email to finish signing in."
      ctaLabel="Verify email"
      ctaUrl={url}
      note="This link expires in 1 hour."
    />
  )
}

export default VerifyEmailTemplate
