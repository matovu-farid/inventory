import { EmailLayout } from './_layout'
import { Section, Text } from '@react-email/components'

export type RequestAccessProps = {
  name: string
  email: string
  message: string
  appUrl: string
}

export function RequestAccessTemplate({
  name,
  email,
  message,
  appUrl,
}: RequestAccessProps) {
  return (
    <EmailLayout
      preview={`New access request from ${name}`}
      appUrl={appUrl}
      heading="New access request"
      intro="Someone has requested access to Inventory Management."
      ctaLabel="Open Inventory Management"
      ctaUrl={appUrl}
      footer="This is an internal notification for an Inventory Management administrator."
    >
      <Section className="bg-slate-50 rounded-lg px-5 py-4 mb-6">
        <Text className="text-slate-700 text-[14px] leading-5 mb-3 mt-0">
          <strong>Requester name:</strong> {name}
        </Text>
        <Text className="text-slate-700 text-[14px] leading-5 mb-3 mt-0">
          <strong>Requester email:</strong> {email}
        </Text>
        <Text className="text-slate-700 text-[14px] leading-5 mb-0 mt-0">
          <strong>Message:</strong>
        </Text>
        <Text className="text-slate-600 text-[14px] leading-5 whitespace-pre-wrap mb-0 mt-2">
          {message}
        </Text>
      </Section>
    </EmailLayout>
  )
}

export default RequestAccessTemplate
