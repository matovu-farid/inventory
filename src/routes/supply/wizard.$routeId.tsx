import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUiPermission } from '#/lib/permissions'
import {
  getSupplyRoute,
  listSuppliersForSelect,
} from '#/server/functions/supply/routes'
import { listItemCategories } from '#/server/functions/items/items'
import { SupplyRouteWizard } from '#/components/supply/supply-route-wizard'
import { normalizeSupplyRouteStep } from '#/lib/supply-route-entry-step'

export const Route = createFileRoute('/supply/wizard/$routeId')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  validateSearch: z.object({
    step: z
      .enum(['basics', 'suppliers', 'items', 'expenses', 'review'])
      .optional(),
  }),
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
  const { step } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SupplyRouteWizard
      initialRoute={route}
      initialCategories={categories}
      initialSuppliers={suppliers}
      initialStep={normalizeSupplyRouteStep(step) ?? 'basics'}
      onStepChange={(nextStep) => void navigate({ search: { step: nextStep } })}
    />
  )
}
