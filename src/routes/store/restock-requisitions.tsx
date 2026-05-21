import { createFileRoute, useRouter } from "@tanstack/react-router"
import { requireUiPermission } from "#/lib/permissions"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import { listOpenRequisitions } from "#/server/functions/store/requisitions"
import { listSupplyRoutes } from "#/server/functions/supply/routes"
import { listSuppliers } from "#/server/functions/supply/suppliers"
import {
  RequisitionsTable,
  type RequisitionRow,
} from "#/components/notifications/requisitions-table"

export const Route = createFileRoute("/store/restock-requisitions")({
  beforeLoad: ({ context }) => requireUiPermission(context, "notifications.manage"),
  loader: async () => {
    const [requisitions, allRoutes, suppliers] = await Promise.all([
      listOpenRequisitions(),
      listSupplyRoutes(),
      listSuppliers(),
    ])
    // Filter routes client-side to status='planning'
    const routes = allRoutes
      .filter((r) => r.status === "planning")
      .map((r) => ({ id: r.id, name: r.name }))
    return {
      requisitions,
      routes,
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })),
    }
  },
  component: RequisitionsPage,
})

function RequisitionsPage() {
  const { requisitions, routes, suppliers } = Route.useLoaderData() as {
    requisitions: RequisitionRow[]
    routes: Array<{ id: string; name: string }>
    suppliers: Array<{ id: string; name: string }>
  }
  const router = useRouter()
  return (
    <div className="container max-w-6xl py-8 space-y-4">
      <h1 className="text-2xl font-bold">Restock requisitions</h1>
      <Card>
        <CardHeader>
          <CardTitle>Open requisitions</CardTitle>
          <CardDescription>
            Items the store needs more of. Select and add them to a planning
            supply route, or dismiss with a reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RequisitionsTable
            rows={requisitions}
            routes={routes}
            suppliers={suppliers}
            onChanged={() => router.invalidate()}
          />
        </CardContent>
      </Card>
    </div>
  )
}
