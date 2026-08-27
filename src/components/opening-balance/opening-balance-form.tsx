import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import BigNumber from 'bignumber.js'
import { LoaderCircle } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { FieldLabel } from '#/components/ui/field-label'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '#/components/ui/responsive-dialog'
import { Spinner } from '#/components/ui/spinner'
import {
  addStoreOpeningBalance,
  addShopOpeningBalance,
} from '#/server/functions/admin/opening-balance'
import { roundUgxBankers50 } from '#/lib/format'
import { OpeningBalanceTable } from './opening-balance-table'
import {
  calculateOpeningBalanceRowAmount,
  createEmptyOpeningBalanceRow,
  groupOpeningBalanceRows,
  isOpeningBalanceRowEmpty,
  validateOpeningBalanceRows,
} from './opening-balance-table-state'
import type { OpeningBalanceTableRow } from './opening-balance-table-state'

interface SubmitSummary {
  scope: 'store' | 'shop'
  itemCount: number
  totalValueUgx: string
}

export type OpeningBalanceShop = {
  id: string
  name: string
  location: string | null
}

interface OpeningBalanceFormProps {
  scope: 'store' | 'shop'
  /** Required when scope === "shop": list of shops the user can choose between. */
  shops?: OpeningBalanceShop[]
  /** Optional initial shop selection (used when arriving from Shop page with ?shopId=…). */
  initialShopId?: string
}

function newOpeningBalanceRow(): OpeningBalanceTableRow {
  return createEmptyOpeningBalanceRow(crypto.randomUUID())
}

export function OpeningBalanceForm({
  scope,
  shops = [],
  initialShopId,
}: OpeningBalanceFormProps) {
  const router = useRouter()
  const [rows, setRows] = useState<OpeningBalanceTableRow[]>(() => [
    newOpeningBalanceRow(),
  ])
  const [shopId, setShopId] = useState<string>(() => {
    if (initialShopId && shops.some((shop) => shop.id === initialShopId)) {
      return initialShopId
    }
    if (shops.length === 0) return ''
    return shops[0].id
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SubmitSummary | null>(null)
  const [resetToken, setResetToken] = useState(0)

  useEffect(() => {
    if (
      scope === 'shop' &&
      initialShopId &&
      shops.some((shop) => shop.id === initialShopId)
    ) {
      setShopId((currentShopId) =>
        currentShopId === initialShopId ? currentShopId : initialShopId,
      )
    }
  }, [initialShopId, scope, shops])

  const populatedRows = rows.filter((row) => !isOpeningBalanceRowEmpty(row))
  const total = populatedRows.reduce(
    (sum, row) => sum.plus(calculateOpeningBalanceRowAmount(row) || 0),
    new BigNumber(0),
  )
  const totalUnits = populatedRows.reduce(
    (sum, row) => sum + (row.quantity ?? 0),
    0,
  )
  const validationError = validateOpeningBalanceRows(rows)
  const canSubmit =
    !pending &&
    populatedRows.length > 0 &&
    (scope === 'store' || shops.some((shop) => shop.id === shopId))

  function handleShopChange(nextShopId: string) {
    if (nextShopId === shopId) return
    if (
      populatedRows.length > 0 &&
      !window.confirm(
        'Switching shops will clear the current opening-balance lines. Continue?',
      )
    ) {
      return
    }
    setShopId(nextShopId)
    setRows([newOpeningBalanceRow()])
    setResetToken((token) => token + 1)
    setError(null)
  }

  function requestSubmit() {
    if (!canSubmit) return
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setConfirmOpen(true)
  }

  async function performSubmit() {
    if (validationError) {
      setError(validationError)
      setConfirmOpen(false)
      return
    }
    setPending(true)
    setError(null)
    try {
      const items = groupOpeningBalanceRows(rows)
      const result =
        scope === 'store'
          ? await addStoreOpeningBalance({ data: { items } })
          : await addShopOpeningBalance({ data: { shopId, items } })

      setSummary({
        scope,
        itemCount: result.itemCount,
        totalValueUgx: result.totalValueUgx,
      })
      setRows([newOpeningBalanceRow()])
      setResetToken((token) => token + 1)
      setConfirmOpen(false)
      void router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  const scopeLabel = scope === 'store' ? 'the Warehouse' : 'Shop'
  const selectedShopName =
    scope === 'shop' ? shops.find((s) => s.id === shopId)?.name : undefined

  return (
    <Card className="relative" aria-busy={pending}>
      <CardHeader>
        <CardTitle>
          {scope === 'store'
            ? 'Warehouse opening balance'
            : 'Shop opening balance'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm shadow-sm">
              <Spinner aria-hidden="true" role="presentation" />
              Saving opening balance…
            </div>
          </div>
        )}

        {scope === 'shop' && (
          <div className="max-w-sm space-y-2">
            <FieldLabel htmlFor="ob-shop" help="openingBalance.shop">
              Shop
            </FieldLabel>
            {shops.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No shops configured yet. Create one on the Shop page first.
              </p>
            ) : (
              <Select value={shopId} onValueChange={handleShopChange}>
                <SelectTrigger id="ob-shop" className="w-full">
                  <SelectValue placeholder="Select a shop" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((shop) => (
                    <SelectItem key={shop.id} value={shop.id}>
                      {shop.name}
                      {shop.location ? ` — ${shop.location}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {summary && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            Posted {summary.itemCount} stock line
            {summary.itemCount === 1 ? '' : 's'} worth{' '}
            <span className="font-mono font-semibold">
              {roundUgxBankers50(summary.totalValueUgx).toFormat(0)}
            </span>{' '}
            UGX as opening balance for{' '}
            {summary.scope === 'store' ? 'the Warehouse' : 'the selected Shop'}.
          </div>
        )}

        {error && (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
            aria-live="assertive"
          >
            {error}
          </div>
        )}

        <OpeningBalanceTable
          rows={rows}
          onRowsChange={(nextRows) => {
            setRows(nextRows)
            setError(null)
          }}
          disabled={pending}
          validationError={error}
          resetToken={resetToken}
        />

        <p className="text-xs text-muted-foreground">
          Select an existing item, then enter its stock details. Amounts are
          calculated automatically. Drag the blue handle on a selected cell down
          to copy it into more lines.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {populatedRows.length} line{populatedRows.length === 1 ? '' : 's'} ·{' '}
            {totalUnits} units · Total:{' '}
            <span className="font-mono font-semibold text-foreground">
              {roundUgxBankers50(total).toFormat(0)}
            </span>{' '}
            UGX
          </span>
          <Button
            className="h-12 w-full md:h-10 md:w-auto"
            disabled={!canSubmit}
            onClick={requestSubmit}
          >
            Submit Opening Balance
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm opening balance</DialogTitle>
              <DialogDescription>
                This will add{' '}
                <span className="font-semibold">{populatedRows.length}</span>{' '}
                stock line{populatedRows.length === 1 ? '' : 's'} totaling{' '}
                <span className="font-mono font-semibold">{totalUnits}</span>{' '}
                units (worth{' '}
                <span className="font-mono font-semibold">
                  {roundUgxBankers50(total).toFormat(0)}
                </span>{' '}
                UGX) to{' '}
                {scope === 'store'
                  ? scopeLabel
                  : `${scopeLabel}${selectedShopName ? ` "${selectedShopName}"` : ''}`}{' '}
                as opening balance. This permanently affects the books.
                Continue?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={() => void performSubmit()} disabled={pending}>
                {pending ? (
                  <>
                    <LoaderCircle className="animate-spin" /> Posting…
                  </>
                ) : (
                  'Confirm & Post'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
