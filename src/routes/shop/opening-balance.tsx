import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { OpeningBalanceForm } from "#/components/opening-balance/opening-balance-form"
import { listShops } from "#/server/functions/admin/locations"
import { getSession } from "#/server/middleware/auth"

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
    const shops = await listShops()
    return { shops, role }
  },
  component: ShopOpeningBalancePage,
})

function ShopOpeningBalancePage() {
  const { shops } = Route.useLoaderData()
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

      <OpeningBalanceForm scope="shop" shops={shops} initialShopId={shopId} />
    </div>
  )
}
