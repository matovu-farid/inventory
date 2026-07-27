import { EmailLayout } from './_layout'

export type InviteUserProps = {
  name: string
  inviterName: string
  url: string
  appUrl: string
}

export function InviteUserTemplate({
  name,
  inviterName,
  url,
  appUrl,
}: InviteUserProps) {
  return (
    <EmailLayout
      preview="You're invited to Inventory Management"
      appUrl={appUrl}
      heading="You're invited to Inventory Management"
      greeting={`Hi ${name},`}
      intro={`${inviterName} invited you to join the Inventory Management workspace. Click below to set your password and sign in.`}
      ctaLabel="Set password & sign in"
      ctaUrl={url}
      note="This invite expires in 7 days."
      footer="If you weren't expecting this invitation, you can safely ignore this email."
    />
  )
}

export default InviteUserTemplate
