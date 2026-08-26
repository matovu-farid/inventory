import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUiPermission } from '#/lib/permissions'
import {
  getSupplyRoute,
  listSuppliersForSelect,
} from '#/server/functions/supply/routes'
import { SupplyRouteWizard } from '#/components/supply/supply-route-wizard'
import { getExistingSupplyRouteInitialStep } from '#/lib/supply-route-entry-step'

export const Route = createFileRoute('/supply/$routeId/entry')({
  beforeLoad: ({ context }) => requireUiPermission(context, 'procurement.view'),
  validateSearch: z.object({
    step: z
      .enum(['basics', 'suppliers', 'items', 'expenses', 'review'])
      .optional(),
  }),
  loader: async ({ params }) => {
    const [route, suppliers] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      listSuppliersForSelect(),
    ])
    return { route, suppliers }
  },
  component: ExistingSupplyRouteEntry,
})

function ExistingSupplyRouteEntry() {
  const { route, suppliers } = Route.useLoaderData()
  const { step } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SupplyRouteWizard
      initialRoute={route}
      initialSuppliers={suppliers}
      initialStep={getExistingSupplyRouteInitialStep(step)}
      onStepChange={(nextStep) => void navigate({ search: { step: nextStep } })}
    />
  )
}
