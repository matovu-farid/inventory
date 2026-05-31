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
} from "@react-email/components"

export interface LowStockDigestData {
  recipientName: string
  appUrl: string
  generatedAt: Date
  storeLowCount: number
  shopLowCount: number
  shopsAffectedCount: number
  topItems: Array<{
    scope: "store" | "shop"
    locationName: string
    itemLabel: string
    quantityAtOpen: number
    baseline: number
    rule: { mode: "percent" | "units"; value: number }
    severity: "critical" | "warning"
  }>
  storeRequisitionsUrl: string
  shopSuggestionsUrl: string
  manageNotificationsUrl: string
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Kampala",
  })

export function LowStockDigestTemplate(data: LowStockDigestData) {
  const preview = `${data.storeLowCount + data.shopLowCount} items below threshold — ${fmtDate(data.generatedAt)}`
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans m-0 p-0">
          <Container className="max-w-[640px] mx-auto py-6">
            {/* Header */}
            <Section className="bg-gradient-to-br from-[#4DA6FF] to-[#0066E6] rounded-t-xl px-8 py-6">
              <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                <tbody>
                  <tr>
                    <td width="48" valign="middle">
                      <Img
                        src={`${data.appUrl}/logo192.png`}
                        width="48"
                        height="48"
                        alt="Inventory Management"
                        className="rounded-[12px] block"
                      />
                    </td>
                    <td valign="middle" style={{ paddingLeft: "16px" }}>
                      <Text className="text-white text-[18px] font-bold m-0 tracking-[-0.3px]">
                        Inventory Management
                      </Text>
                      <Text className="text-white/80 text-[13px] m-0 mt-1">
                        Daily low-stock digest · {fmtDate(data.generatedAt)}
                      </Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* Body */}
            <Section className="bg-white px-8 pt-8 pb-6">
              <Heading className="text-slate-900 text-[22px] font-bold mb-2 mt-0 tracking-[-0.3px]">
                Hi {data.recipientName},
              </Heading>
              <Text className="text-slate-600 text-[15px] leading-6 mb-6 mt-0">
                Here&apos;s what needs attention this morning.
              </Text>

              {/* Stat tiles */}
              <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                <tbody>
                  <tr>
                    <td width="50%" valign="top" style={{ paddingRight: "8px" }}>
                      <Section className="bg-rose-50 rounded-lg px-5 py-4">
                        <Text className="text-rose-900 text-[28px] font-bold m-0 leading-none">
                          {data.storeLowCount}
                        </Text>
                        <Text className="text-rose-700 text-[13px] font-medium m-0 mt-2">
                          store items low
                        </Text>
                      </Section>
                    </td>
                    <td width="50%" valign="top" style={{ paddingLeft: "8px" }}>
                      <Section className="bg-amber-50 rounded-lg px-5 py-4">
                        <Text className="text-amber-900 text-[28px] font-bold m-0 leading-none">
                          {data.shopLowCount}
                        </Text>
                        <Text className="text-amber-700 text-[13px] font-medium m-0 mt-2">
                          shop items low
                          {data.shopsAffectedCount > 0 &&
                            ` · ${data.shopsAffectedCount} shop${data.shopsAffectedCount === 1 ? "" : "s"}`}
                        </Text>
                      </Section>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Top items */}
              {data.topItems.length > 0 && (
                <Section className="mt-8">
                  <Heading
                    as="h2"
                    className="text-slate-900 text-[16px] font-semibold mb-3 mt-0"
                  >
                    Most urgent
                  </Heading>
                  {data.topItems.map((item, idx) => (
                    <ItemRow key={idx} item={item} />
                  ))}
                </Section>
              )}

              {/* CTAs */}
              <Section className="mt-8">
                <table cellPadding="0" cellSpacing="0" border={0} width="100%">
                  <tbody>
                    <tr>
                      <td
                        width="50%"
                        align="center"
                        style={{ paddingRight: "6px" }}
                      >
                        <Button
                          href={data.storeRequisitionsUrl}
                          className="bg-[#0066E6] text-white text-[14px] font-semibold rounded-md px-5 py-3 no-underline inline-block w-full text-center"
                        >
                          Store requisitions →
                        </Button>
                      </td>
                      <td
                        width="50%"
                        align="center"
                        style={{ paddingLeft: "6px" }}
                      >
                        <Button
                          href={data.shopSuggestionsUrl}
                          className="bg-slate-900 text-white text-[14px] font-semibold rounded-md px-5 py-3 no-underline inline-block w-full text-center"
                        >
                          Shop suggestions →
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            </Section>

            <Hr className="border-slate-200 my-0" />

            {/* Footer */}
            <Section className="bg-white rounded-b-xl px-8 py-5">
              <Text className="text-slate-400 text-[12px] leading-5 m-0 text-center">
                You&apos;re receiving this because you&apos;re an admin or
                supervisor.{" "}
                <Link
                  href={data.manageNotificationsUrl}
                  className="text-[#0066E6]"
                >
                  Manage thresholds
                </Link>
                .
              </Text>
              <Text className="text-slate-300 text-[11px] text-center pt-2 m-0">
                © {data.generatedAt.getFullYear()} Inventory Management
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

function ItemRow({
  item,
}: {
  item: LowStockDigestData["topItems"][number]
}) {
  const tone =
    item.severity === "critical"
      ? {
          bg: "bg-rose-50",
          border: "border-rose-300",
          chipBg: "bg-rose-100",
          chipText: "text-rose-800",
          label: "Critical",
        }
      : {
          bg: "bg-amber-50",
          border: "border-amber-300",
          chipBg: "bg-amber-100",
          chipText: "text-amber-800",
          label: "Warning",
        }
  const detail =
    item.rule.mode === "percent"
      ? `${item.quantityAtOpen} on hand when alert opened (threshold ${item.rule.value}% of ~${item.baseline} typical)`
      : `${item.quantityAtOpen} when alert opened (threshold ${item.rule.value} units)`
  return (
    <Section
      className={`${tone.bg} border-l-4 ${tone.border} rounded-r-md px-4 py-3 mb-2`}
    >
      <table cellPadding="0" cellSpacing="0" border={0} width="100%">
        <tbody>
          <tr>
            <td valign="top">
              <Text className="text-slate-900 text-[14px] font-semibold m-0">
                {item.itemLabel}
              </Text>
              <Text className="text-slate-600 text-[12px] m-0 mt-1">
                {item.scope === "store" ? "Store" : "Shop"} ·{" "}
                {item.locationName}
              </Text>
              <Text className="text-slate-500 text-[12px] m-0 mt-1">
                {detail}
              </Text>
            </td>
            <td valign="top" align="right" width="100">
              <Text
                className={`${tone.chipBg} ${tone.chipText} text-[11px] font-bold rounded-full px-3 py-1 m-0 inline-block`}
              >
                {tone.label.toUpperCase()}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}
