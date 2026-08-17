import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  getSupplyRoute,
  updateSupplyRoute,
} from '#/server/functions/supply/routes'
import type { listSuppliersForSelect } from '#/server/functions/supply/routes'
import { deleteSupplyRouteItem } from '#/server/functions/supply/items'
import { AddItemForm } from '#/components/supply/add-item-form'
import type { SupplyRouteEntryDraft } from '#/components/supply/add-item-form'
import { SupplyRouteExpenses } from '#/components/supply/supply-route-expenses'
import { SupplyRouteReview } from '#/components/supply/supply-route-review'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { DatePicker } from '#/components/ui/date-picker'
import { Textarea } from '#/components/ui/textarea'
import { FieldLabel } from '#/components/ui/field-label'
import { ReviewLabel } from '#/components/supply/review-label'
import type { HelpKey } from '#/lib/help-dictionary'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import { SUPPLY_ROUTE_STEPS, SupplyRouteStepper } from './supply-route-steps'
import type { SupplyRouteStepId } from './supply-route-steps'
import { getDistinctRouteSuppliers } from '#/lib/supply-route-suppliers'

type RouteData = Awaited<ReturnType<typeof getSupplyRoute>>
type SupplierOption = Awaited<ReturnType<typeof listSuppliersForSelect>>[number]

export function SupplyRouteWizard({
  initialRoute,
  initialCategories,
  initialSuppliers,
  initialStep = 'basics',
  onStepChange,
}: {
  initialRoute: RouteData
  initialCategories: ReadonlyArray<string>
  initialSuppliers: ReadonlyArray<SupplierOption>
  initialStep?: SupplyRouteStepId
  onStepChange?: (step: SupplyRouteStepId) => void
}) {
  const router = useRouter()
  const [route, setRoute] = useState(initialRoute)
  const [step, setStep] = useState<SupplyRouteStepId>(initialStep)
  const [categories] = useState(initialCategories)
  const suppliers = initialSuppliers
  const [basics, setBasics] = useState(() => ({
    name: initialRoute.name,
    departureDate: initialRoute.departureDate ?? '',
    returnDate: initialRoute.returnDate ?? '',
    budgetUsd: initialRoute.budgetUsd ?? '',
    rateUgxPerUsd: initialRoute.rateUgxPerUsd ?? '',
    rateRmbPerUsd: initialRoute.rateRmbPerUsd ?? '',
    notes: initialRoute.notes ?? '',
  }))
  const basicsRef = useRef(basics)
  const savedBasicsRef = useRef(basics)
  const [basicsDirty, setBasicsDirty] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  const [error, setError] = useState('')
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

  useEffect(() => {
    setStep(initialStep)
  }, [initialStep])

  const entryGroups = useMemo(() => {
    const groups = new Map<string, typeof route.items>()
    for (const line of route.items) {
      const current = groups.get(line.entryId) ?? []
      current.push(line)
      groups.set(line.entryId, current)
    }
    return [...groups.values()]
  }, [route])

  const reviewLines = useMemo(
    () =>
      route.items.map((line) => {
        const item = line.item ?? line.itemColor?.item
        return {
          date: route.departureDate,
          supplierName: line.supplierNameSnapshot ?? line.supplier.name,
          articleNumber: line.articleNumberSnapshot ?? item?.articleNumber,
          itemName: line.itemNameSnapshot ?? item?.name,
          colorName: line.colorNameSnapshot ?? line.itemColor?.colorName,
          size: line.size,
          quantity: line.quantity,
          unitPriceForeign: line.unitPriceForeign,
          foreignCurrency: line.foreignCurrency,
          exchangeRateForeignToUsd: line.exchangeRateForeignToUsd,
          exchangeRateUsdToUgx: line.exchangeRateUsdToUgx,
          totalAmountForeign: line.totalAmountForeign,
          totalAmountUsd: line.totalAmountUsd,
          totalCostUgx: line.totalCostUgx,
          minimumSellPriceUgx: line.minimumSellPriceUgx,
        }
      }),
    [route.departureDate, route.items],
  )

  const editingEntry = useMemo<SupplyRouteEntryDraft | undefined>(() => {
    if (!editingEntryId) return undefined
    const group = entryGroups.find(
      (rows) => rows[0]?.entryId === editingEntryId,
    )
    const first = group?.[0]
    if (!group || !first?.item?.articleNumber) return undefined
    return {
      entryId: first.entryId,
      itemId: first.item.id,
      articleNumber: first.item.articleNumber,
      supplierId: first.supplierId,
      foreignCurrency: first.foreignCurrency,
      exchangeRateForeignToUsd: first.exchangeRateForeignToUsd,
      exchangeRateUsdToUgx: first.exchangeRateUsdToUgx,
      cells: group.map((line) => ({
        itemColorId: line.colorId ?? undefined,
        size: line.size ?? undefined,
        quantity: line.quantity,
      })),
    }
  }, [editingEntryId, entryGroups])

  async function refreshRoute() {
    const next = await getSupplyRoute({ data: { id: route.id } })
    setRoute(next)
  }

  const persistBasics = useCallback(async () => {
    const draft = basicsRef.current
    if (!basicsDirty) return true
    if (!draft.name.trim()) {
      setError('Route name is required')
      return false
    }
    if (
      draft.departureDate &&
      draft.returnDate &&
      draft.departureDate > draft.returnDate
    ) {
      setError('Return date must be on or after departure date')
      return false
    }
    const baseline = savedBasicsRef.current
    const payload = {
      id: route.id,
      ...(draft.name !== baseline.name ? { name: draft.name.trim() } : {}),
      ...(draft.departureDate !== baseline.departureDate
        ? { departureDate: draft.departureDate || null }
        : {}),
      ...(draft.returnDate !== baseline.returnDate
        ? { returnDate: draft.returnDate || null }
        : {}),
      ...(draft.budgetUsd !== baseline.budgetUsd
        ? { budgetUsd: draft.budgetUsd || null }
        : {}),
      ...(draft.rateUgxPerUsd !== baseline.rateUgxPerUsd
        ? { rateUgxPerUsd: draft.rateUgxPerUsd || null }
        : {}),
      ...(draft.rateRmbPerUsd !== baseline.rateRmbPerUsd
        ? { rateRmbPerUsd: draft.rateRmbPerUsd || null }
        : {}),
      ...(draft.notes !== baseline.notes ? { notes: draft.notes || null } : {}),
    }
    if (Object.keys(payload).length === 1) {
      setBasicsDirty(false)
      setSaveState('saved')
      return true
    }
    setSaveState('saving')
    try {
      const saved = await updateSupplyRoute({
        data: payload,
      })
      setRoute((current) => ({ ...current, ...saved }))
      savedBasicsRef.current = draft
      if (JSON.stringify(basicsRef.current) === JSON.stringify(draft)) {
        setBasicsDirty(false)
      }
      setSaveState('saved')
      setError('')
      return true
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : 'Could not save route')
      return false
    }
  }, [basicsDirty, route.id])

  useEffect(() => {
    if (!basicsDirty) return
    const timer = window.setTimeout(() => void persistBasics(), 700)
    return () => window.clearTimeout(timer)
  }, [basics, basicsDirty, persistBasics])

  function updateBasic<TKey extends keyof typeof basics>(
    key: TKey,
    value: (typeof basics)[TKey],
  ) {
    setBasics((current) => ({ ...current, [key]: value }))
    basicsRef.current = { ...basicsRef.current, [key]: value }
    setBasicsDirty(true)
  }

  async function goTo(nextStep: SupplyRouteStepId) {
    if (!(await persistBasics())) return
    setError('')
    setStep(nextStep)
    onStepChange?.(nextStep)
  }

  async function exitWizard() {
    if (!(await persistBasics())) return
    await router.navigate({
      to: '/supply/$routeId',
      params: { routeId: route.id },
    })
  }

  async function finishRoute() {
    if (!(await persistBasics())) return
    await router.navigate({
      to: '/supply',
      search: { completedRoute: route.id },
    })
  }

  const currentIndex = SUPPLY_ROUTE_STEPS.findIndex(
    (entry) => entry.id === step,
  )
  const isLocked = route.status !== 'open'
  const routeStatusLabel = route.displayStatus.replace('_', ' ')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Supply route entry</p>
          <h1 className="text-2xl font-bold">{route.name}</h1>
          <p className="text-sm text-muted-foreground">
            Add or update route information over multiple sessions. Your open
            route stays available until receiving is complete.
          </p>
          {initialStep !== 'basics' && !isLocked && (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => void goTo('basics')}
            >
              Edit route details
            </Button>
          )}
        </div>
        <Badge
          variant={
            route.displayStatus === 'received'
              ? 'secondary'
              : route.displayStatus === 'partially_received'
                ? 'default'
                : 'outline'
          }
        >
          {routeStatusLabel}
        </Badge>
      </div>

      <SupplyRouteStepper
        activeStep={step}
        onStep={(nextStep) => void goTo(nextStep)}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {currentIndex + 1} of {SUPPLY_ROUTE_STEPS.length}
        </span>
        <span>
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'error'
              ? 'Save failed'
              : 'All changes saved'}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {step === 'basics' && (
        <Card>
          <CardHeader>
            <CardTitle>Route basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <FieldLabel htmlFor="wizard-route-name">Route name *</FieldLabel>
              <Input
                id="wizard-route-name"
                value={basics.name}
                disabled={isLocked}
                onChange={(e) => updateBasic('name', e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-departure">
                  Departure date
                </FieldLabel>
                <DatePicker
                  id="wizard-departure"
                  value={basics.departureDate}
                  disabled={isLocked}
                  onChange={(value) => updateBasic('departureDate', value)}
                  placeholder="Select departure date"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-return">Return date</FieldLabel>
                <DatePicker
                  id="wizard-return"
                  value={basics.returnDate}
                  disabled={isLocked}
                  onChange={(value) => updateBasic('returnDate', value)}
                  placeholder="Select return date"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-budget">Budget (USD)</FieldLabel>
                <MoneyInput
                  id="wizard-budget"
                  currency="USD"
                  decimals={2}
                  value={basics.budgetUsd}
                  disabled={isLocked}
                  onChange={(value) => updateBasic('budgetUsd', value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-rate-ugx">UGX per USD</FieldLabel>
                <MoneyInput
                  id="wizard-rate-ugx"
                  currency="UGX/USD"
                  decimals={0}
                  value={basics.rateUgxPerUsd}
                  disabled={isLocked}
                  onChange={(value) => updateBasic('rateUgxPerUsd', value)}
                  placeholder="e.g. 3,750"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-rate-rmb">RMB per USD</FieldLabel>
                <MoneyInput
                  id="wizard-rate-rmb"
                  currency="RMB/USD"
                  decimals={6}
                  value={basics.rateRmbPerUsd}
                  disabled={isLocked}
                  onChange={(value) => updateBasic('rateRmbPerUsd', value)}
                  placeholder="e.g. 7.25"
                />
              </div>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="wizard-notes">Notes</FieldLabel>
              <Textarea
                id="wizard-notes"
                rows={4}
                value={basics.notes}
                disabled={isLocked}
                onChange={(e) => updateBasic('notes', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'items' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>
                  {editingEntry ? 'Edit item entry' : 'Add items to this route'}
                </CardTitle>
                {editingEntry && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingEntryId(null)}
                  >
                    Cancel edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLocked ? (
                <p className="text-sm text-muted-foreground">
                  This route has been received and is locked.
                </p>
              ) : (
                <AddItemForm
                  key={editingEntryId ?? 'new-entry'}
                  supplyRouteId={route.id}
                  rateUgxPerUsd={route.rateUgxPerUsd}
                  rateRmbPerUsd={route.rateRmbPerUsd}
                  categories={categories}
                  suppliers={suppliers}
                  initialEntry={editingEntry}
                  onSaved={() => {
                    setEditingEntryId(null)
                    return refreshRoute()
                  }}
                  onDone={async () => {
                    await refreshRoute()
                    await goTo('expenses')
                  }}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Items already entered</CardTitle>
            </CardHeader>
            <CardContent>
              {route.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No items entered yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {entryGroups.map((group) => {
                    const first = group[0]
                    const received = group.some((line) => line.received)
                    return (
                      <div
                        key={first.entryId}
                        className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {first.item
                              ? first.item.name
                              : first.itemColor
                                ? first.itemColor.item.name
                                : 'Item'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.length} detail row
                            {group.length === 1 ? '' : 's'} ·{' '}
                            {group.reduce(
                              (sum, line) => sum + line.quantity,
                              0,
                            )}{' '}
                            units
                            {received ? ' · received/locked' : ''}
                          </p>
                        </div>
                        {!received && (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingEntryId(first.entryId)}
                            >
                              Edit quantities
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                if (!window.confirm('Remove this item entry?'))
                                  return
                                void deleteSupplyRouteItem({
                                  data: { id: first.id },
                                })
                                  .then(() => refreshRoute())
                                  .catch((cause) =>
                                    setError(
                                      cause instanceof Error
                                        ? cause.message
                                        : 'Could not remove item entry',
                                    ),
                                  )
                              }}
                            >
                              <Trash2 className="mr-1 size-3" /> Remove entry
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'expenses' && (
        <SupplyRouteExpenses
          supplyRouteId={route.id}
          rateUgxPerUsd={route.rateUgxPerUsd}
          rateRmbPerUsd={route.rateRmbPerUsd}
          expenses={route.expenses}
          disabled={isLocked}
          onChanged={() => void refreshRoute()}
        />
      )}

      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Review route entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary
                label="Route"
                help="supplyRoute.name"
                value={route.name}
              />
              <Summary
                label="Suppliers"
                help="review.suppliers"
                value={String(getDistinctRouteSuppliers(route.items).length)}
              />
              <Summary
                label="Entry rows"
                help="review.entryRows"
                value={String(route.items.length)}
              />
            </div>
            <div className="rounded-md bg-muted/50 p-4 text-sm">
              <p className="font-medium">This route remains open</p>
              <p className="mt-1 text-muted-foreground">
                Finish this session whenever you like. You can return to the
                same open route and keep adding items on another day. Receiving
                is the action that eventually closes the route.
              </p>
            </div>
            <SupplyRouteReview
              lines={reviewLines}
              expenses={route.expenses}
              routeDetails={{
                name: route.name,
                departureDate: route.departureDate,
                returnDate: route.returnDate,
                budgetUsd: route.budgetUsd,
                rateUgxPerUsd: route.rateUgxPerUsd,
                rateRmbPerUsd: route.rateRmbPerUsd,
                notes: route.notes,
                suppliers: getDistinctRouteSuppliers(route.items).map(
                  (supplier) => supplier.name,
                ),
              }}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void exitWizard()}
          >
            Save and exit
          </Button>
        </div>
        <div className="flex gap-2">
          {currentIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void goTo(SUPPLY_ROUTE_STEPS[currentIndex - 1].id)}
            >
              <ArrowLeft className="mr-1 size-4" /> Back
            </Button>
          )}
          {currentIndex < SUPPLY_ROUTE_STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => void goTo(SUPPLY_ROUTE_STEPS[currentIndex + 1].id)}
            >
              Continue <ArrowRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={isLocked}
              onClick={() => void finishRoute()}
            >
              Finish route
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Summary({
  label,
  help,
  value,
}: {
  label: string
  help: HelpKey
  value: string
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">
        <ReviewLabel label={label} help={help} />
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}
