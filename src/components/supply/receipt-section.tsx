import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import {
  createSupplyRouteReceipt,
  deleteSupplyRouteReceipt,
  replaceSupplyRouteReceipt,
} from '#/server/functions/supply/receipts'
import type {
  getSupplyRoute,
  listSuppliersForSelect,
} from '#/server/functions/supply/routes'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Spinner } from '#/components/ui/spinner'
import { Combobox } from '#/components/ui/combobox'
import { DatePicker } from '#/components/ui/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { ReceiptGrid } from './receipt-grid/receipt-grid'
import { ReceiptRateInput } from './receipt-rate-input'
import {
  copyReceiptRow,
  createEmptyReceiptRow,
  stripEmptyReceiptRows,
  validateReceiptRows,
} from './receipt-grid/receipt-grid-state'
import type {
  ReceiptGridCatalogItem,
  ReceiptGridRow,
} from './receipt-grid/types'
import type { ReceiptQuantityDistribution } from '#/components/item-entry-grid/distribution-types'

type RouteData = Awaited<ReturnType<typeof getSupplyRoute>>
type ReceiptData = RouteData['receipts'][number]
type SupplierOption = Awaited<ReturnType<typeof listSuppliersForSelect>>[number]

function catalogItemFromLine(
  line: ReceiptData['lines'][number],
): ReceiptGridCatalogItem | null {
  const item = line.item ?? line.itemColor?.item
  if (!item) return null
  return {
    id: item.id,
    name: item.name,
    design: item.design,
    articleNumbers: item.articleNumbers,
    colors: item.colors.map((color) => ({
      id: color.id,
      colorName: color.colorName,
      colorHex: color.colorHex,
    })),
    variants: item.variants,
    costCurrency: item.costCurrency,
    minimumSellPriceUgx: item.minimumSellPriceUgx,
    lowStockThreshold: item.lowStockThreshold,
  }
}

function rowsFromReceipt(receipt: ReceiptData): ReceiptGridRow[] {
  const entryRows = receipt.entries.map((entry) => {
    const allocations = entry.allocations
    const distributed =
      allocations.length > 1 ||
      allocations.some((allocation) => allocation.kind !== 'aggregate')
    const distribution: ReceiptQuantityDistribution | null = distributed
      ? {
          mode: allocations.some((allocation) => allocation.kind === 'variant')
            ? 'variants'
            : 'colors',
          cells: allocations.map((allocation) => ({
            color: allocation.colorNameSnapshot ?? '',
            colorId: allocation.colorId,
            colorHex: allocation.colorHexSnapshot,
            size: allocation.size ?? undefined,
            quantity: allocation.quantity,
          })),
        }
      : null
    const colors = Array.from(
      new Map(
        allocations.flatMap((allocation) =>
          allocation.colorNameSnapshot
            ? [
                [
                  allocation.colorNameSnapshot.toLocaleLowerCase(),
                  allocation,
                ] as const,
              ]
            : [],
        ),
      ).values(),
    )
    const sizes = Array.from(
      new Set(
        allocations
          .map((allocation) => allocation.size)
          .filter((size): size is string => Boolean(size)),
      ),
    )
    const item = entry.item
    return {
      ...createEmptyReceiptRow(entry.id),
      itemName: entry.itemNameSnapshot,
      design: entry.designSnapshot,
      itemId: entry.itemId,
      catalogItem: item
        ? {
            id: item.id,
            name: item.name,
            design: item.design,
            articleNumbers: item.articleNumbers,
            colors: item.colors,
            variants: item.variants,
            costCurrency: item.costCurrency,
            minimumSellPriceUgx: item.minimumSellPriceUgx,
            lowStockThreshold: item.lowStockThreshold,
          }
        : null,
      articleNumber: entry.articleNumberSnapshot,
      colorText: colors
        .map((allocation) => allocation.colorNameSnapshot)
        .join(', '),
      colorHexText: colors
        .map((allocation) => allocation.colorHexSnapshot)
        .filter(Boolean)
        .join(', '),
      colorIds: colors
        .map((allocation) => allocation.colorId)
        .filter((id): id is string => Boolean(id)),
      sizeText: sizes.join(', '),
      quantity: entry.quantity,
      unitPriceForeign: entry.unitPriceForeign,
      minimumSellPriceUgx: entry.minimumSellPriceUgx,
      lowStockThreshold: entry.lowStockThreshold,
      distribution,
    }
  })
  if (entryRows.length) {
    return [...entryRows, createEmptyReceiptRow(`${receipt.id}-buffer`)]
  }
  return [
    ...receipt.lines.map((line) => ({
      ...createEmptyReceiptRow(line.id),
      itemName:
        line.itemNameSnapshot ??
        line.item?.name ??
        line.itemColor?.item.name ??
        '',
      design:
        line.designSnapshot ??
        line.item?.design ??
        line.itemColor?.item.design ??
        line.itemNameSnapshot ??
        '',
      itemId: line.itemId,
      catalogItem: catalogItemFromLine(line),
      articleNumber:
        line.articleNumberSnapshot ??
        line.item?.articleNumbers[0]?.articleNumber ??
        line.itemColor?.item.articleNumbers[0]?.articleNumber ??
        '',
      colorText:
        line.colorTextSnapshot ??
        line.colorNameSnapshot ??
        line.itemColor?.colorName ??
        '',
      colorHexText: line.colorHexSnapshot ?? line.itemColor?.colorHex ?? '',
      colorIds: line.colorId ? [line.colorId] : [],
      sizeText: line.sizeTextSnapshot ?? line.size ?? '',
      quantity: line.quantity,
      unitPriceForeign: line.unitPriceForeign,
      minimumSellPriceUgx: line.minimumSellPriceUgx,
      lowStockThreshold: line.lowStockThreshold,
    })),
    createEmptyReceiptRow(`${receipt.id}-buffer`),
  ]
}

type ReceiptDraft = {
  supplierId: string
  receiptDate: string
  reference: string
  notes: string
  foreignCurrency: string
  foreignRate: string
  ugxRate: string
  rows: ReceiptGridRow[]
}

type ReceiptDraftField = Exclude<keyof ReceiptDraft, 'rows'>

type ReceiptHistory = {
  past: ReceiptDraft[]
  future: ReceiptDraft[]
}

function createReceiptDraft(
  receipt: ReceiptData | undefined,
  routeRates: { ugxPerUsd?: string | null; rmbPerUsd?: string | null },
): ReceiptDraft {
  return {
    supplierId: receipt?.supplierId ?? '',
    receiptDate: receipt?.receiptDate ?? '',
    reference: receipt?.reference ?? '',
    notes: receipt?.notes ?? '',
    foreignCurrency: receipt?.foreignCurrency ?? 'RMB',
    foreignRate:
      receipt?.exchangeRateForeignToUsd ?? routeRates.rmbPerUsd ?? '',
    ugxRate: receipt?.exchangeRateUsdToUgx ?? routeRates.ugxPerUsd ?? '',
    rows: receipt
      ? rowsFromReceipt(receipt)
      : [createEmptyReceiptRow(crypto.randomUUID())],
  }
}

function cloneReceiptDraft(draft: ReceiptDraft): ReceiptDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => copyReceiptRow(row, row.id)),
  }
}

function receiptDraftsEqual(left: ReceiptDraft, right: ReceiptDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function ReceiptSection({
  supplyRouteId,
  routeRates,
  suppliers,
  receipt,
  disabled = false,
  onChanged,
}: {
  supplyRouteId: string
  routeRates: { ugxPerUsd?: string | null; rmbPerUsd?: string | null }
  suppliers: ReadonlyArray<SupplierOption>
  receipt?: ReceiptData
  disabled?: boolean
  onChanged: () => Promise<void> | void
}) {
  const receiptSignature = useMemo(
    () =>
      JSON.stringify(
        receipt
          ? {
              id: receipt.id,
              supplierId: receipt.supplierId,
              receiptDate: receipt.receiptDate,
              reference: receipt.reference,
              notes: receipt.notes,
              foreignCurrency: receipt.foreignCurrency,
              exchangeRateForeignToUsd: receipt.exchangeRateForeignToUsd,
              exchangeRateUsdToUgx: receipt.exchangeRateUsdToUgx,
              lines: receipt.lines,
            }
          : { id: null },
      ),
    [receipt],
  )
  const [draft, setDraft] = useState<ReceiptDraft>(() =>
    createReceiptDraft(receipt, routeRates),
  )
  const draftRef = useRef(draft)
  const historyRef = useRef<ReceiptHistory>({ past: [], future: [] })
  const lastReceiptSignatureRef = useRef(receiptSignature)
  const [, setHistoryVersion] = useState(0)
  const [busyAction, setBusyAction] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const {
    supplierId,
    receiptDate,
    reference,
    notes,
    foreignCurrency,
    foreignRate,
    ugxRate,
    rows,
  } = draft
  const received = receipt?.lines.some((line) => line.received) ?? false
  const busy = busyAction !== null
  const locked = disabled || received || busy
  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === supplierId),
    [supplierId, suppliers],
  )
  const supplierOptions = useMemo(
    () =>
      suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
      })),
    [suppliers],
  )

  draftRef.current = draft

  useEffect(() => {
    if (lastReceiptSignatureRef.current === receiptSignature) return
    lastReceiptSignatureRef.current = receiptSignature
    const nextDraft = createReceiptDraft(receipt, routeRates)
    draftRef.current = nextDraft
    setDraft(nextDraft)
    historyRef.current = { past: [], future: [] }
    setHistoryVersion((version) => version + 1)
  }, [receipt, receiptSignature, routeRates])

  const commitDraft = useCallback((nextDraft: ReceiptDraft) => {
    const currentDraft = draftRef.current
    if (receiptDraftsEqual(currentDraft, nextDraft)) return
    historyRef.current = {
      past: [...historyRef.current.past, cloneReceiptDraft(currentDraft)],
      future: [],
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    setHistoryVersion((version) => version + 1)
  }, [])

  const updateDraftField = useCallback(
    (field: ReceiptDraftField, value: string) => {
      commitDraft({ ...draftRef.current, [field]: value })
    },
    [commitDraft],
  )

  const undoHistory = useCallback(() => {
    const previous = historyRef.current.past.at(-1)
    if (locked || !previous) return
    const currentDraft = draftRef.current
    historyRef.current = {
      past: historyRef.current.past.slice(0, -1),
      future: [...historyRef.current.future, cloneReceiptDraft(currentDraft)],
    }
    draftRef.current = previous
    setDraft(previous)
    setHistoryVersion((version) => version + 1)
  }, [locked])

  const redoHistory = useCallback(() => {
    const nextDraft = historyRef.current.future.at(-1)
    if (locked || !nextDraft) return
    const currentDraft = draftRef.current
    historyRef.current = {
      past: [...historyRef.current.past, cloneReceiptDraft(currentDraft)],
      future: historyRef.current.future.slice(0, -1),
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    setHistoryVersion((version) => version + 1)
  }, [locked])

  async function save() {
    if (!supplierId) {
      setError('Select a supplier for this receipt')
      return
    }
    const rowValidationError = validateReceiptRows(rows)
    if (rowValidationError) {
      setError(rowValidationError)
      return
    }
    if (foreignCurrency === 'RMB' && !foreignRate.trim()) {
      setError('Enter the RMB per USD exchange rate before saving this receipt')
      return
    }
    if (foreignCurrency !== 'UGX' && !ugxRate.trim()) {
      setError('Enter the UGX per USD exchange rate before saving this receipt')
      return
    }
    const lines = stripEmptyReceiptRows(rows).map((row) => ({
      itemName: row.itemName.trim(),
      design: row.design.trim(),
      itemId: row.itemId,
      articleNumber: row.articleNumber.trim(),
      colorId: row.colorIds.length === 1 ? row.colorIds[0] : null,
      colorText: row.colorText.trim() || undefined,
      colorHex: row.colorHexText.trim() || undefined,
      size: row.sizeText.trim() || undefined,
      quantity: row.quantity as number,
      unitPriceForeign: row.unitPriceForeign.trim(),
      minimumSellPriceUgx: row.minimumSellPriceUgx.trim() || undefined,
      lowStockThreshold: row.lowStockThreshold,
      distribution: row.distribution ?? undefined,
    }))
    setBusyAction('save')
    setError('')
    try {
      const data = {
        supplyRouteId,
        supplierId,
        receiptDate: receiptDate || undefined,
        reference: reference || undefined,
        notes: notes || undefined,
        foreignCurrency: foreignCurrency as 'RMB' | 'USD' | 'UGX',
        exchangeRateForeignToUsd:
          foreignCurrency === 'RMB' ? foreignRate || undefined : undefined,
        exchangeRateUsdToUgx:
          foreignCurrency === 'UGX' ? undefined : ugxRate || undefined,
        lines,
      }
      if (receipt) {
        await replaceSupplyRouteReceipt({
          data: { ...data, receiptId: receipt.id },
        })
      } else {
        await createSupplyRouteReceipt({ data })
      }
      await onChanged()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save receipt',
      )
    } finally {
      setBusyAction(null)
    }
  }

  async function remove() {
    if (!receipt || locked) return
    if (!window.confirm('Remove this receipt and all its lines?')) return
    setBusyAction('remove')
    setError('')
    try {
      await deleteSupplyRouteReceipt({
        data: { supplyRouteId, receiptId: receipt.id },
      })
      await onChanged()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not remove receipt',
      )
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <div
      className="relative"
      aria-busy={busy}
      data-receipt-saving={busy ? 'true' : undefined}
    >
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle className="text-base">
                {receipt
                  ? `Receipt ${receipt.reference || receipt.id.slice(0, 8)}`
                  : 'New receipt'}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {received
                  ? 'Received and locked'
                  : 'One supplier for this receipt'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {receipt && !received && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void remove()}
                  disabled={busy}
                >
                  {busyAction === 'remove' ? (
                    <Spinner
                      data-icon="inline-start"
                      aria-hidden="true"
                      role="presentation"
                    />
                  ) : (
                    <Trash2 className="mr-1 size-4" />
                  )}
                  {busyAction === 'remove' ? 'Removing…' : 'Remove'}
                </Button>
              )}
              {!disabled && !received && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void save()}
                  disabled={busy}
                >
                  {busyAction === 'save' && (
                    <Spinner
                      data-icon="inline-start"
                      aria-hidden="true"
                      role="presentation"
                    />
                  )}
                  {busyAction === 'save' ? 'Saving…' : 'Save receipt'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1 text-sm">
              <Label>Supplier *</Label>
              <Combobox
                options={supplierOptions}
                value={supplierId}
                onChange={(value) => updateDraftField('supplierId', value)}
                placeholder="Select supplier"
                searchPlaceholder="Search suppliers..."
                emptyMessage="No suppliers found."
                disabled={locked}
                aria-label="Supplier *"
              />
            </div>
            <div className="space-y-1 text-sm">
              <Label htmlFor="receipt-date">Receipt date</Label>
              <DatePicker
                id="receipt-date"
                name="receipt-date"
                value={receiptDate}
                disabled={locked}
                onChange={(value) => updateDraftField('receiptDate', value)}
                placeholder="Select receipt date"
              />
            </div>
            <div className="space-y-1 text-sm">
              <Label>Reference</Label>
              <Input
                name="receipt-reference"
                value={reference}
                disabled={locked}
                placeholder="Optional"
                onChange={(event) =>
                  updateDraftField('reference', event.target.value)
                }
              />
            </div>
            <div className="space-y-1 text-sm">
              <Label>Currency</Label>
              <Select
                value={foreignCurrency}
                onValueChange={(value) =>
                  updateDraftField('foreignCurrency', value)
                }
                disabled={locked}
              >
                <SelectTrigger aria-label="Currency" className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RMB">RMB</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="UGX">UGX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {foreignCurrency !== 'UGX' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {foreignCurrency === 'RMB' && (
                <label className="space-y-1 text-sm">
                  <Label>RMB per USD</Label>
                  <ReceiptRateInput
                    name="receipt-foreign-rate"
                    value={foreignRate}
                    disabled={locked}
                    onChange={(value) => updateDraftField('foreignRate', value)}
                  />
                </label>
              )}
              <label className="space-y-1 text-sm">
                <Label>UGX per USD</Label>
                <ReceiptRateInput
                  decimals={0}
                  name="receipt-ugx-rate"
                  value={ugxRate}
                  disabled={locked}
                  onChange={(value) => updateDraftField('ugxRate', value)}
                />
              </label>
            </div>
          )}
          <ClientOnly fallback={<ReceiptGridFallback />}>
            <ReceiptGrid
              rows={rows}
              supplierId={supplierId}
              disabled={locked}
              onRowsChange={(nextRows) => {
                commitDraft({ ...draftRef.current, rows: nextRows })
                setError('')
              }}
              historyControls={{
                canUndo: historyRef.current.past.length > 0,
                canRedo: historyRef.current.future.length > 0,
                onUndo: undoHistory,
                onRedo: redoHistory,
              }}
            />
          </ClientOnly>
          <label className="block space-y-1 text-sm">
            <Label>Receipt notes</Label>
            <Input
              name="receipt-notes"
              value={notes}
              disabled={locked}
              placeholder="Optional notes"
              onChange={(event) =>
                updateDraftField('notes', event.target.value)
              }
            />
          </label>
          {selectedSupplier && !locked && (
            <p className="text-xs text-muted-foreground">
              Purchasing from {selectedSupplier.name}. Drag a selected cell’s
              fill handle down to copy it.
            </p>
          )}
          {!locked && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              New designs and art numbers are added to the catalog when you save
              this receipt.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      {busy && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted/70 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <span className="flex items-center gap-2 rounded-md border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-sm">
            <Spinner aria-hidden="true" role="presentation" />
            {busyAction === 'remove' ? 'Removing receipt…' : 'Saving receipt…'}
          </span>
        </div>
      )}
    </div>
  )
}

function ReceiptGridFallback() {
  return (
    <div className="min-w-[1160px] overflow-hidden rounded-md border bg-background">
      <div className="grid grid-cols-9 border-b bg-muted/50 text-xs font-semibold text-muted-foreground">
        {[
          '',
          'Item name',
          'Design',
          'Art No.',
          'Colour',
          'Size',
          'Qty (pcs)',
          'Unit Price',
          'Min sell price (UGX)',
          'Low-stock threshold',
          'Amount',
        ].map((label) => (
          <div key={label} className="border-r px-3 py-2 last:border-r-0">
            {label}
          </div>
        ))}
      </div>
      <div className="flex h-[150px] items-center justify-center text-sm text-muted-foreground">
        Loading receipt editor…
      </div>
    </div>
  )
}
