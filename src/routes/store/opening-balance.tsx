import { createFileRoute } from "@tanstack/react-router"
import { OpeningBalanceForm } from "#/components/opening-balance/opening-balance-form"
import { getSession } from "#/server/middleware/auth"

// No PagePrerequisites wrapper here by design: the opening-balance form is
// the bootstrap mechanism for an empty warehouse, so it must always be
// reachable. Auth/role is the only gate. The page is therefore omitted
// from getSystemPrereqs.
export const Route = createFileRoute("/store/opening-balance")({
  loader: async () => {
    const session = await getSession()
    const role = (session?.user as { role?: string } | undefined)?.role
    if (!session || (role !== "admin" && role !== "supervisor")) {
      throw new Error("Forbidden: admin or supervisor role required")
    }
    return { role }
  },
  component: StoreOpeningBalancePage,
})

function StoreOpeningBalancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Warehouse Opening Balance</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Seed initial warehouse inventory that wasn't acquired through a supply
          route. Each entry posts a journal:{" "}
          <span className="font-mono">DR Inventory</span> /{" "}
          <span className="font-mono">CR Owner&apos;s Equity</span>.
        </p>
      </div>

      <OpeningBalanceForm scope="store" />
    </div>
  )
}
