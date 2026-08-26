import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireUiPermission } from '#/lib/permissions'
import {
  getSupplyRoute,
  listReceiptCatalogIndex,
  listSuppliersForSelect,
} from '#/server/functions/supply/routes'
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
    const [route, suppliers, catalogIndex] = await Promise.all([
      getSupplyRoute({ data: { id: params.routeId } }),
      listSuppliersForSelect(),
      listReceiptCatalogIndex(),
    ])
    return { route, suppliers, catalogIndex }
  },
  component: SupplyRouteWizardPage,
})

function SupplyRouteWizardPage() {
  const { route, suppliers, catalogIndex } = Route.useLoaderData()
  const { step } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SupplyRouteWizard
      initialRoute={route}
      initialSuppliers={suppliers}
      initialCatalogIndex={catalogIndex}
      initialStep={normalizeSupplyRouteStep(step) ?? 'basics'}
      onStepChange={(nextStep) => void navigate({ search: { step: nextStep } })}
    />
  )
}
