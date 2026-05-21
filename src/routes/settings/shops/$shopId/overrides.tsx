import { createFileRoute, useRouter, Link } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { listOverrides } from "#/server/functions/notifications/thresholds"
import { listProductColorsForOverrides } from "#/server/functions/products/colors"
import { getShop } from "#/server/functions/shop/list-shops"
import {
  OverrideTable,
  type OverrideRow,
} from "#/components/notifications/override-table"

export const Route = createFileRoute("/settings/shops/$shopId/overrides")({
  beforeLoad: ({ context }) => requireUiPermission(context, "users.manage"),
  loader: async ({ params }) => {
    const [shop, overrides, productColorsRaw] = await Promise.all([
      getShop({ data: { id: params.shopId } }),
      listOverrides({ data: { shopId: params.shopId } }),
      listProductColorsForOverrides(),
    ])
    const productOptions = productColorsRaw.map((pc) => ({
      productColorId: pc.id,
      label: `${pc.product.articleNumber} · ${pc.colorName}`,
      sizes:
        "sizes" in pc.product && Array.isArray(pc.product.sizes) && pc.product.sizes.length > 0
          ? (pc.product.sizes as string[])
          : ["S", "M", "L", "XL", "XXL"],
    }))
    return { shop, overrides, productOptions }
  },
  component: PerShopOverridesPage,
})

function PerShopOverridesPage() {
  const { shop, overrides, productOptions } = Route.useLoaderData() as {
    shop: { id: string; name: string }
    overrides: OverrideRow[]
    productOptions: Array<{ productColorId: string; label: string; sizes: string[] }>
  }
  const router = useRouter()
  return (
    <div className="container max-w-3xl py-8 space-y-4">
      <Link
        to="/settings/notifications"
        className="text-sm text-muted-foreground underline"
      >
        ← Notifications settings
      </Link>
      <h1 className="text-2xl font-bold">Stock alerts — {shop.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Overrides for this shop</CardTitle>
          <CardDescription>
            These rules apply only when checking {shop.name}&apos;s stock. They
            beat product-only overrides and the global default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OverrideTable
            rows={overrides}
            showShopColumn={true}
            productOptions={productOptions}
            shopOptions={[{ id: shop.id, name: shop.name }]}
            defaultShopId={shop.id}
            onChanged={() => {
              void router.invalidate()
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
