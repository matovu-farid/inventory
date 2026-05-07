import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { OpeningBalanceForm } from "#/components/opening-balance/opening-balance-form"
import { PagePrerequisites } from "#/components/prerequisites/page-prerequisites"
import { listShops } from "#/server/functions/admin/locations"
import { getSession } from "#/server/middleware/auth"
import { getShopOpeningBalancePrereqs } from "#/server/functions/prereqs/shop"

const searchSchema = z.object({
  shopId: z.string().uuid().optional(),
})

export const Route = createFileRoute("/shop/opening-balance")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ shopId: search.shopId }),
  loader: async () => {
    const session = await getSession()
    const role = (session?.user as { role?: string } | undefined)?.role
    if (!session || (role !== "admin" && role !== "supervisor")) {
      throw new Error("Forbidden: admin or supervisor role required")
    }
    const [shops, prerequisites] = await Promise.all([
      listShops(),
      getShopOpeningBalancePrereqs(),
    ])
    return { shops, role, prerequisites }
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
          from the warehouse. Each entry posts a journal:{" "}
          <span className="font-mono">DR Inventory</span> /{" "}
          <span className="font-mono">CR Owner&apos;s Equity</span>.
        </p>
      </div>

      <PagePrerequisites result={prerequisites}>
        <OpeningBalanceForm scope="shop" shops={shops} initialShopId={shopId} />
      </PagePrerequisites>
    </div>
  )
}
