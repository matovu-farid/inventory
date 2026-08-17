import type { SupplyRouteStepId } from '#/components/supply/supply-route-steps'

export type SupplyRouteSearchStepId = SupplyRouteStepId | 'suppliers'

export function normalizeSupplyRouteStep(
  step: SupplyRouteSearchStepId | undefined,
): SupplyRouteStepId | undefined {
  return step === 'suppliers' ? 'items' : step
}

export function getExistingSupplyRouteInitialStep(
  step: SupplyRouteSearchStepId | undefined,
): SupplyRouteStepId {
  return normalizeSupplyRouteStep(step) ?? 'review'
}
