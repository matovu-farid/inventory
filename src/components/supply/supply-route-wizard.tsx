import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import BigNumber from 'bignumber.js'
import {
  getSupplyRoute,
  addSupplierToRoute,
  listSuppliersForSelect,
  removeSupplierFromRoute,
  updateSupplyRoute,
} from '#/server/functions/supply/routes'
import {
  createSupplier,
  restoreSupplier,
} from '#/server/functions/supply/suppliers'
import { deleteSupplyRouteItem } from '#/server/functions/supply/items'
import { AddItemForm } from '#/components/supply/add-item-form'
import type { SupplyRouteEntryDraft } from '#/components/supply/add-item-form'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { Textarea } from '#/components/ui/textarea'
import { FieldLabel } from '#/components/ui/field-label'
import { Badge } from '#/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Plus, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import { SUPPLY_ROUTE_STEPS, SupplyRouteStepper } from './supply-route-steps'
import type { SupplyRouteStepId } from './supply-route-steps'

type RouteData = Awaited<ReturnType<typeof getSupplyRoute>>
type SupplierOption = Awaited<ReturnType<typeof listSuppliersForSelect>>[number]

export function SupplyRouteWizard({
  initialRoute,
  initialCategories,
  initialSuppliers,
  initialStep = 'basics',
}: {
  initialRoute: RouteData
  initialCategories: ReadonlyArray<string>
  initialSuppliers: ReadonlyArray<SupplierOption>
  initialStep?: SupplyRouteStepId
}) {
  const router = useRouter()
  const [route, setRoute] = useState(initialRoute)
  const [step, setStep] = useState<SupplyRouteStepId>(initialStep)
  const [categories] = useState(initialCategories)
  const [suppliers, setSuppliers] =
    useState<ReadonlyArray<SupplierOption>>(initialSuppliers)
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
  const [newSupplierOpen, setNewSupplierOpen] = useState(false)
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    type: 'international' as SupplierOption['type'],
    country: '',
  })
  const [supplierPending, setSupplierPending] = useState(false)
  const [showArchivedSuppliers, setShowArchivedSuppliers] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)

  const routeSupplierIds = useMemo(
    () => new Set(route.suppliers.map((entry) => entry.supplier.id)),
    [route.suppliers],
  )

  const entryGroups = useMemo(() => {
    const groups = new Map<string, typeof route.items>()
    for (const line of route.items) {
      const current = groups.get(line.entryId) ?? []
      current.push(line)
      groups.set(line.entryId, current)
    }
    return [...groups.values()]
  }, [route])

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

  function goTo(nextStep: SupplyRouteStepId) {
    setError('')
    setStep(nextStep)
  }

  async function exitWizard() {
    if (!(await persistBasics())) return
    await router.navigate({
      to: '/supply/$routeId',
      params: { routeId: route.id },
    })
  }

  async function addExistingSupplier(supplierId: string) {
    if (routeSupplierIds.has(supplierId)) return
    setSupplierPending(true)
    try {
      const selected = suppliers.find((supplier) => supplier.id === supplierId)
      if (selected?.deletedAt) {
        if (
          !window.confirm(
            `Restore ${selected.name} before adding it to this route?`,
          )
        ) {
          return
        }
        await restoreSupplier({ data: { id: supplierId } })
        setSuppliers((current) =>
          current.map((supplier) =>
            supplier.id === supplierId
              ? { ...supplier, deletedAt: null }
              : supplier,
          ),
        )
      }
      await addSupplierToRoute({
        data: { supplyRouteId: route.id, supplierId },
      })
      await refreshRoute()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add supplier')
    } finally {
      setSupplierPending(false)
    }
  }

  async function handleCreateSupplier(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newSupplier.name.trim()) {
      setError('Supplier name is required')
      return
    }
    setSupplierPending(true)
    try {
      const supplier = await createSupplier({
        data: {
          name: newSupplier.name.trim(),
          type: newSupplier.type,
          country: newSupplier.country.trim() || undefined,
        },
      })
      setSuppliers((current) =>
        [...current, supplier].sort((a, b) => a.name.localeCompare(b.name)),
      )
      await addExistingSupplier(supplier.id)
      setNewSupplier({ name: '', type: 'international', country: '' })
      setNewSupplierOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create supplier')
    } finally {
      setSupplierPending(false)
    }
  }

  async function handleRemoveSupplier(linkId: string) {
    setSupplierPending(true)
    try {
      await removeSupplierFromRoute({ data: { id: linkId } })
      await refreshRoute()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove supplier')
    } finally {
      setSupplierPending(false)
    }
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
          {initialStep !== 'basics' && (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => setStep('basics')}
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

      <SupplyRouteStepper activeStep={step} onStep={goTo} />

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
                onChange={(e) => updateBasic('name', e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-departure">
                  Departure date
                </FieldLabel>
                <Input
                  id="wizard-departure"
                  type="date"
                  value={basics.departureDate}
                  onChange={(e) => updateBasic('departureDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="wizard-return">Return date</FieldLabel>
                <Input
                  id="wizard-return"
                  type="date"
                  value={basics.returnDate}
                  onChange={(e) => updateBasic('returnDate', e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel>Budget (USD)</FieldLabel>
                <MoneyInput
                  currency="USD"
                  decimals={2}
                  value={basics.budgetUsd}
                  onChange={(value) => updateBasic('budgetUsd', value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>UGX per USD</FieldLabel>
                <MoneyInput
                  currency="UGX/USD"
                  decimals={0}
                  value={basics.rateUgxPerUsd}
                  onChange={(value) => updateBasic('rateUgxPerUsd', value)}
                  placeholder="e.g. 3,750"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel>RMB per USD</FieldLabel>
                <MoneyInput
                  currency="RMB/USD"
                  decimals={6}
                  value={basics.rateRmbPerUsd}
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
                onChange={(e) => updateBasic('notes', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'suppliers' && (
        <Card>
          <CardHeader>
            <CardTitle>Route suppliers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add every supplier you may purchase from on this route. You can
              still choose a different supplier for an individual item.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                onValueChange={(value) => void addExistingSupplier(value)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select an existing supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers
                    .filter((supplier) => !routeSupplierIds.has(supplier.id))
                    .map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.deletedAt ? ' · Archived' : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewSupplierOpen((open) => !open)}
              >
                <Plus className="mr-1 size-4" /> New supplier
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const next = !showArchivedSuppliers
                  setShowArchivedSuppliers(next)
                  void listSuppliersForSelect({
                    data: { includeArchived: next },
                  }).then(setSuppliers)
                }}
              >
                {showArchivedSuppliers ? 'Hide archived' : 'Search archived'}
              </Button>
            </div>
            {newSupplierOpen && (
              <form
                className="rounded-md border p-4"
                onSubmit={(e) => void handleCreateSupplier(e)}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <FieldLabel htmlFor="new-supplier-name">Name *</FieldLabel>
                    <Input
                      id="new-supplier-name"
                      value={newSupplier.name}
                      onChange={(e) =>
                        setNewSupplier((current) => ({
                          ...current,
                          name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Type</FieldLabel>
                    <Select
                      value={newSupplier.type}
                      onValueChange={(value: SupplierOption['type']) =>
                        setNewSupplier((current) => ({
                          ...current,
                          type: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="international">
                          International
                        </SelectItem>
                        <SelectItem value="local">Local</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel htmlFor="new-supplier-country">
                      Country
                    </FieldLabel>
                    <Input
                      id="new-supplier-country"
                      value={newSupplier.country}
                      onChange={(e) =>
                        setNewSupplier((current) => ({
                          ...current,
                          country: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <Button
                  className="mt-3"
                  type="submit"
                  disabled={supplierPending}
                >
                  {supplierPending ? 'Saving…' : 'Create and add supplier'}
                </Button>
              </form>
            )}
            <div className="space-y-2">
              {route.suppliers.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No suppliers linked yet.
                </p>
              )}
              {route.suppliers.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{entry.supplier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.supplier.type}
                      {entry.supplier.country
                        ? ` · ${entry.supplier.country}`
                        : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={supplierPending}
                    onClick={() => void handleRemoveSupplier(entry.id)}
                    title="Remove supplier from route"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
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
              {route.suppliers.length === 0 ? (
                <p className="text-sm text-destructive">
                  Add at least one supplier before adding items.
                </p>
              ) : isLocked ? (
                <p className="text-sm text-muted-foreground">
                  This route has been received and is locked.
                </p>
              ) : (
                <AddItemForm
                  supplyRouteId={route.id}
                  rateUgxPerUsd={route.rateUgxPerUsd}
                  rateRmbPerUsd={route.rateRmbPerUsd}
                  categories={categories}
                  suppliers={route.suppliers.map((entry) => ({
                    id: entry.supplier.id,
                    name: entry.supplier.name,
                  }))}
                  initialEntry={editingEntry}
                  onSuccess={() => {
                    setEditingEntryId(null)
                    void refreshRoute()
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

      {step === 'review' && (
        <Card>
          <CardHeader>
            <CardTitle>Review route entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Summary label="Route" value={route.name} />
              <Summary
                label="Suppliers"
                value={String(route.suppliers.length)}
              />
              <Summary label="Entry rows" value={String(route.items.length)} />
            </div>
            <div className="rounded-md bg-muted/50 p-4 text-sm">
              <p className="font-medium">This route remains open</p>
              <p className="mt-1 text-muted-foreground">
                Finish this session whenever you like. You can return to the
                same open route and keep adding items on another day. Receiving
                is the action that eventually closes the route.
              </p>
            </div>
            <div className="space-y-2">
              {route.items.slice(0, 8).map((line) => (
                <div key={line.id} className="flex justify-between text-sm">
                  <span>
                    {line.item
                      ? line.item.name
                      : line.itemColor
                        ? line.itemColor.item.name
                        : 'Item'}
                  </span>
                  <span className="font-mono">
                    {line.quantity} ·{' '}
                    {new BigNumber(line.totalCostUgx).toFormat(0)} UGX
                  </span>
                </div>
              ))}
            </div>
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
              onClick={() => setStep(SUPPLY_ROUTE_STEPS[currentIndex - 1].id)}
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
            <Button type="button" onClick={() => void exitWizard()}>
              Finish route
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}
