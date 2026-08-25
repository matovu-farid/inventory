import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

export type EmailLayoutProps = {
  preview: string
  appUrl: string
  heading: string
  greeting?: string
  intro: string
  children?: ReactNode
  ctaLabel: string
  ctaUrl: string
  note?: string
  noteTone?: 'info' | 'warning'
  footer?: string
}

export function EmailLayout({
  preview,
  appUrl,
  heading,
  greeting,
  intro,
  children,
  ctaLabel,
  ctaUrl,
  note,
  noteTone = 'info',
  footer = 'If you did not request this, you can safely ignore this email.',
}: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans m-0 p-0">
          <Container className="max-w-[560px] mx-auto py-6">
            <Section className="bg-gradient-to-br from-[#4DA6FF] to-[#0066E6] rounded-t-xl px-8 py-5">
              <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                <tr>
                  <td width="48" valign="middle">
                    <Img
                      src={`${appUrl}/logo192.png`}
                      width="48"
                      height="48"
                      alt="Inventory Management"
                      className="rounded-[12px] block"
                    />
                  </td>
                  <td valign="middle" style={{ paddingLeft: '16px' }}>
                    <Text className="text-white text-[18px] font-bold m-0 tracking-[-0.3px]">
                      Inventory Management
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            <Section className="bg-white px-8 pt-8 pb-6 rounded-b-xl shadow-sm">
              <Heading className="text-slate-900 text-[24px] font-bold mb-4 mt-0 tracking-[-0.3px]">
                {heading}
              </Heading>
              {greeting && (
                <Text className="text-slate-700 text-[15px] leading-6 mb-2 mt-0">
                  {greeting}
                </Text>
              )}
              <Text className="text-slate-600 text-[15px] leading-6 mb-6 mt-0">
                {intro}
              </Text>

              {children}

              <Section className="text-center mb-6">
                <Button
                  href={ctaUrl}
                  className="bg-[#0066E6] text-white text-[15px] font-semibold rounded-md px-8 py-3 no-underline inline-block"
                >
                  {ctaLabel}
                </Button>
              </Section>

              {note && (
                <Text
                  className={
                    noteTone === 'warning'
                      ? 'text-amber-600 text-[13px] font-medium mb-4 mt-0'
                      : 'text-slate-500 text-[13px] mb-4 mt-0'
                  }
                >
                  {note}
                </Text>
              )}

              <Text className="text-slate-400 text-[12px] leading-5 mb-1 mt-0">
                Or copy and paste this URL into your browser:
              </Text>
              <Link
                href={ctaUrl}
                className="text-[#0066E6] text-[12px] break-all"
              >
                {ctaUrl}
              </Link>
            </Section>

            <Hr className="border-slate-200 my-0" />

            <Text className="text-slate-400 text-[12px] leading-5 text-center pt-4 px-8 m-0">
              {footer}
            </Text>
            <Text className="text-slate-300 text-[11px] text-center pt-2 px-8 m-0">
              © {new Date().getFullYear()} Inventory Management
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
