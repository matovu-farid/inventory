import { createFileRoute, useRouter, Link } from '@tanstack/react-router'
import { requireUiPermission } from '#/lib/permissions'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { listOverrides } from '#/server/functions/notifications/thresholds'
import { listItemsForOverrides } from '#/server/functions/items/colors'
import { getShop } from '#/server/functions/shop/list-shops'
import { OverrideTable } from '#/components/notifications/override-table'
import { formatItemArticleNumbers } from '#/lib/items/article-number'

export const Route = createFileRoute('/settings/shops/$shopId/overrides')({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, 'notifications.manage'),
  loader: async ({ params }) => {
    const [shop, overrides, itemsRaw] = await Promise.all([
      getShop({ data: { id: params.shopId } }),
      listOverrides({ data: { shopId: params.shopId } }),
      listItemsForOverrides(),
    ])
    const itemOptions = itemsRaw.map((it) => ({
      itemId: it.id,
      label: `${formatItemArticleNumbers(it.articleNumbers)} ${it.name}`,
    }))
    return { shop, overrides, itemOptions }
  },
  component: PerShopOverridesPage,
})

function PerShopOverridesPage() {
  const { shop, overrides, itemOptions } = Route.useLoaderData()
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
            itemOptions={itemOptions}
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
