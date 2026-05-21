import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { requireUiPermission } from "#/lib/permissions"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { InfoTip } from "#/components/ui/info-tip"
import {
  getThresholds,
  updateThresholds,
  listOverrides,
} from "#/server/functions/notifications/thresholds"
import { runThresholdChecksNow } from "#/server/functions/notifications/notifications"
import {
  ThresholdField,
  type ThresholdValue,
} from "#/components/notifications/threshold-form"
import {
  OverrideTable,
  type OverrideRow,
} from "#/components/notifications/override-table"
import { listProductColorsForOverrides } from "#/server/functions/products/colors"
import { listShopsForReports } from "#/server/functions/shop/list-shops"

export const Route = createFileRoute("/settings/notifications")({
  beforeLoad: ({ context }) => requireUiPermission(context, "users.manage"),
  loader: async () => {
    const [thresholds, allOverrides, productColorsRaw, shops] =
      await Promise.all([
        getThresholds(),
        listOverrides({ data: {} }),
        listProductColorsForOverrides(),
        listShopsForReports(),
      ])

    // Product-scope overrides: shopId is null (no shop filter)
    const productOverrides = allOverrides.filter((o) => o.shopId === null)

    const productOptions = productColorsRaw.map((pc) => ({
      productColorId: pc.id,
      label: `${pc.product.articleNumber} · ${pc.colorName}`,
      sizes: pc.product.sizes.length > 0
        ? pc.product.sizes
        : ["S", "M", "L", "XL", "XXL"],
    }))

    return { thresholds, productOverrides, productOptions, shops }
  },
  component: NotificationsSettingsPage,
})

type Banner = { kind: "success" | "error"; text: string }

function NotificationsSettingsPage() {
  const loaderData = Route.useLoaderData()
  const router = useRouter()
  const [store, setStore] = useState<ThresholdValue>(loaderData.thresholds.store)
  const [shop, setShop] = useState<ThresholdValue>(loaderData.thresholds.shop)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [saveBanner, setSaveBanner] = useState<Banner | null>(null)
  const [runBanner, setRunBanner] = useState<Banner | null>(null)

  async function onSave() {
    setSaving(true)
    setSaveBanner(null)
    try {
      await updateThresholds({ data: { store, shop } })
      setSaveBanner({ kind: "success", text: "Thresholds saved." })
      await router.invalidate()
    } catch (err) {
      setSaveBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to save.",
      })
    } finally {
      setSaving(false)
    }
  }

  async function onRunNow() {
    setRunning(true)
    setRunBanner(null)
    try {
      const r = await runThresholdChecksNow()
      const opened = r.shopAlertsOpened + r.storeAlertsOpened
      const resolved = r.shopAlertsResolved + r.storeAlertsResolved
      setRunBanner({
        kind: "success",
        text: `Check complete. Opened: ${opened}, resolved: ${resolved}.`,
      })
    } catch (err) {
      setRunBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Check failed.",
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notification thresholds</h1>
        <p className="text-muted-foreground text-sm">
          Choose when the system flags an item as low stock. Percentages compare
          against a rolling average of the last 3 batches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global defaults</CardTitle>
          <CardDescription>
            Used for every variant unless a per-product override applies.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ThresholdField
            label="Store (warehouse) threshold"
            helpText="Default trigger when warehouse stock for a variant runs low."
            value={store}
            onChange={setStore}
            modeHelpKey="notifications.thresholds.storeMode"
            valueHelpKey="notifications.thresholds.storeValue"
          />
          <ThresholdField
            label="Shop threshold"
            helpText="Default trigger for every shop's stock of a variant."
            value={shop}
            onChange={setShop}
            modeHelpKey="notifications.thresholds.shopMode"
            valueHelpKey="notifications.thresholds.shopValue"
          />
          {saveBanner && <FormMessage message={saveBanner} />}
          <Button onClick={() => { void onSave() }} disabled={saving}>
            {saving ? "Saving…" : "Save defaults"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual check</CardTitle>
          <CardDescription>
            Run the threshold scan now. Normally runs every hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {runBanner && <FormMessage message={runBanner} />}
          <Button
            variant="outline"
            onClick={() => { void onRunNow() }}
            disabled={running}
          >
            {running ? "Running…" : "Run check now"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Product overrides
            <InfoTip term="notifications.overrides.title" />
          </CardTitle>
          <CardDescription>
            Override the global defaults for specific product variants. These
            rules apply across all shops unless a per-shop override takes
            precedence.{" "}
            <span className="text-muted-foreground">
              Per-shop overrides can be set on each shop&apos;s settings page.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OverrideTable
            rows={loaderData.productOverrides as OverrideRow[]}
            showShopColumn={false}
            productOptions={loaderData.productOptions}
            shopOptions={loaderData.shops}
            onChanged={() => { void router.invalidate() }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function FormMessage({ message }: { message: Banner }) {
  const cls =
    message.kind === "success"
      ? "rounded-md bg-emerald-500/10 px-3 py-2 text-[13px] text-emerald-700"
      : "rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
  return <div className={cls}>{message.text}</div>
}
