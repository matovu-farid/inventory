import { createFileRoute } from '@tanstack/react-router'
import { requireUiPermission } from '#/lib/permissions'
import {
  getSupplyRoute,
  listSuppliersForSelect,
} from '#/server/functions/supply/routes'
import { listItemCategories } from '#/server/functions/items/items'
import { SupplyRouteWizard } from '#/components/supply/supply-route-wizard'

export const Route = createFileRoute('/supply/wizard/$routeId')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  loader: async ({ params }) => {
    const [route, categories, suppliers] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      listItemCategories(),
      listSuppliersForSelect(),
    ])
    return { route, categories, suppliers }
  },
  component: SupplyRouteWizardPage,
})

function SupplyRouteWizardPage() {
  const { route, categories, suppliers } = Route.useLoaderData()
  return (
    <SupplyRouteWizard
      initialRoute={route}
      initialCategories={categories}
      initialSuppliers={suppliers}
    />
  )
}
