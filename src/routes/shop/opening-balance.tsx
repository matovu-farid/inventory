import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { OpeningBalanceForm } from '#/components/opening-balance/opening-balance-form'
import { PagePrerequisites } from '#/components/prerequisites/page-prerequisites'
import { requireUiPermission } from '#/lib/permissions'
import { listShops } from '#/server/functions/admin/locations'
import { getShopOpeningBalancePrereqs } from '#/server/functions/prereqs/shop'

const searchSchema = z.object({
  shopId: z.uuid().optional(),
})

export const Route = createFileRoute('/shop/opening-balance')({
  beforeLoad: ({ context }) =>
    requireUiPermission(context, 'shop.openingBalance'),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ shopId: search.shopId }),
  loader: async () => {
    const [shops, prerequisites] = await Promise.all([
      listShops(),
      getShopOpeningBalancePrereqs(),
    ])
    return { shops, prerequisites }
  },
  component: ShopOpeningBalancePage,
})

function ShopOpeningBalancePage() {
  const { shops, prerequisites } = Route.useLoaderData()
  const { shopId } = Route.useSearch()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shop Opening Balance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Seed initial shop inventory that wasn't acquired through a transfer
          from the warehouse. Each entry posts a journal:{' '}
          <span className="font-mono">DR Inventory</span> /{' '}
          <span className="font-mono">CR Owner&apos;s Equity</span>.
        </p>
      </div>

      <PagePrerequisites result={prerequisites}>
        <OpeningBalanceForm scope="shop" shops={shops} initialShopId={shopId} />
      </PagePrerequisites>
    </div>
  )
}
