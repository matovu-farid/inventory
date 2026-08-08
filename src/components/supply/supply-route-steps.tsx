import { Check } from 'lucide-react'
import { Button } from '#/components/ui/button'

export const SUPPLY_ROUTE_STEPS = [
  { id: 'basics', label: 'Route basics' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'items', label: 'Items' },
  { id: 'review', label: 'Review' },
] as const

export type SupplyRouteStepId = (typeof SUPPLY_ROUTE_STEPS)[number]['id']

export function SupplyRouteStepper({
  activeStep,
  onStep,
}: {
  activeStep: SupplyRouteStepId
  onStep: (step: SupplyRouteStepId) => void
}) {
  const currentIndex = SUPPLY_ROUTE_STEPS.findIndex(
    (entry) => entry.id === activeStep,
  )
  return (
    <nav aria-label="Supply route steps" className="rounded-lg border p-3">
      <ol className="grid gap-2 sm:grid-cols-4">
        {SUPPLY_ROUTE_STEPS.map((entry, index) => {
          const complete = index < currentIndex
          const active = entry.id === activeStep
          return (
            <li key={entry.id}>
              <Button
                type="button"
                variant="ghost"
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => onStep(entry.id)}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">
                  {complete ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span>{entry.label}</span>
              </Button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
