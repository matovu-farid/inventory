import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import BigNumber from 'bignumber.js'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { MoneyInput } from '#/components/ui/money-input'
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
import {
  addStoreOpeningBalance,
  addShopOpeningBalance,
} from '#/server/functions/admin/opening-balance'
import { roundUgxBankers50 } from '#/lib/format'
import {
  deriveSizes,
  openingBalanceImplicitSize,
  openingBalanceUsesVariantGrid,
} from '#/lib/variants'
import { ItemPicker } from '#/components/items/item-picker'
import type { ItemSummary } from '#/components/items/item-picker'
import { ItemEditor } from '#/components/items/item-editor'
import { ColorEditor } from '#/components/items/color-editor'
import { VariantGrid } from '#/components/items/variant-grid'
import { ColorQuantityList } from '#/components/supply/split-item-form'
import { getItemByArticle } from '#/server/functions/items/items'

function cellsFromBlock(b: ValidBlock) {
  if (!openingBalanceUsesVariantGrid(b.item)) {
    const size = openingBalanceImplicitSize(b.item)
    return Object.entries(b.quantities)
      .filter(([, q]) => q > 0)
      .map(([colorId, q]) => ({ colorId, size, quantity: q }))
  }
  return Object.entries(b.quantities)
    .filter(([, q]) => q > 0)
    .map(([key, q]) => {
      const [colorId, size] = key.split('|')
      if (!colorId || !size) {
        throw new Error(`Invalid grid cell key: ${key}`)
      }
      return { colorId, size, quantity: q }
    })
}

interface DraftBlock {
  id: string
  item?: ItemSummary
  unitCostUgx: string
  quantities: Record<string, number> // keyed by `${itemColorId}|${size}`
  itemEditorOpen: boolean
  colorEditorOpen: boolean
}

interface SubmitSummary {
  scope: 'store' | 'shop'
  itemCount: number
  totalValueUgx: string
}

function newBlock(): DraftBlock {
  return {
    id: crypto.randomUUID(),
    item: undefined,
    unitCostUgx: '',
    quantities: {},
    itemEditorOpen: false,
    colorEditorOpen: false,
  }
}

function blockUnitTotal(b: DraftBlock): number {
  return Object.values(b.quantities).reduce((s, q) => s + q, 0)
}

type ValidBlock = DraftBlock & { item: ItemSummary }

function blockIsValid(b: DraftBlock): b is ValidBlock {
  if (!b.item) return false
  const cost = new BigNumber(b.unitCostUgx || '0')
  if (!cost.isFinite() || cost.lte(0)) return false
  return blockUnitTotal(b) > 0
}

function blockValue(b: DraftBlock): BigNumber {
  if (!blockIsValid(b)) return new BigNumber(0)
  const cost = new BigNumber(b.unitCostUgx || '0')
  return cost.times(blockUnitTotal(b))
}

function blocksTotal(blocks: DraftBlock[]): BigNumber {
  return blocks.reduce((sum, b) => sum.plus(blockValue(b)), new BigNumber(0))
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
  /**
   * Existing item categories used to autocomplete the category field when
   * the user creates a brand-new item from inside this form.
   */
  categories?: ReadonlyArray<string>
}

export function OpeningBalanceForm({
  scope,
  shops = [],
  initialShopId,
  categories = [],
}: OpeningBalanceFormProps) {
  const router = useRouter()
  const [blocks, setBlocks] = useState<DraftBlock[]>([newBlock()])
  const [shopId, setShopId] = useState<string>(() => {
    if (initialShopId) return initialShopId
    if (shops.length === 0) return ''
    return shops[0].id
  })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SubmitSummary | null>(null)

  const total = blocksTotal(blocks)
  const validBlocks = blocks.filter(blockIsValid)
  const validCount = validBlocks.length
  const totalUnits = validBlocks.reduce((s, b) => s + blockUnitTotal(b), 0)
  const allBlocksValid = blocks.length > 0 && blocks.every(blockIsValid)
  const canSubmit = allBlocksValid && (scope === 'store' || !!shopId)

  function updateBlock(id: string, patch: Partial<DraftBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function removeBlock(id: string) {
    setBlocks((bs) => (bs.length === 1 ? bs : bs.filter((b) => b.id !== id)))
  }

  function addBlock() {
    setBlocks((bs) => [...bs, newBlock()])
  }

  async function refreshBlockItem(id: string, articleNumber: string) {
    const p = await getItemByArticle({ data: { articleNumber } })
    if (p) {
      updateBlock(id, { item: p })
    }
  }

  async function performSubmit() {
    setPending(true)
    setError(null)
    try {
      const items = blocks.filter(blockIsValid).map((b) => {
        const cells = cellsFromBlock(b)
        return {
          itemId: b.item.id,
          unitCostUgx: new BigNumber(b.unitCostUgx).toFixed(2),
          cells,
        }
      })

      const result =
        scope === 'store'
          ? await addStoreOpeningBalance({ data: { items } })
          : await addShopOpeningBalance({ data: { shopId, items } })

      setSummary({
        scope,
        itemCount: result.itemCount,
        totalValueUgx: result.totalValueUgx,
      })
      setBlocks([newBlock()])
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
    <Card>
      <CardHeader>
        <CardTitle>
          {scope === 'store'
            ? 'Warehouse opening balance'
            : 'Shop opening balance'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {scope === 'shop' && (
          <div className="space-y-2 max-w-sm">
            <FieldLabel htmlFor="ob-shop" help="openingBalance.shop">
              Shop
            </FieldLabel>
            {shops.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No shops configured yet. Create one on the Shop page first.
              </p>
            ) : (
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger id="ob-shop" className="w-full">
                  <SelectValue placeholder="Select a shop" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.location ? ` — ${s.location}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {summary && (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            Posted {summary.itemCount} item{summary.itemCount === 1 ? '' : 's'}{' '}
            worth{' '}
            <span className="font-mono font-semibold">
              {roundUgxBankers50(summary.totalValueUgx).toFormat(0)}
            </span>{' '}
            UGX as opening balance for{' '}
            {summary.scope === 'store' ? 'the Warehouse' : 'the selected Shop'}.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {blocks.map((b, idx) => {
            const units = blockUnitTotal(b)
            const value = blockValue(b)
            return (
              <div
                key={b.id}
                className="rounded-md border bg-card p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Item {idx + 1}
                    {b.item ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        — {b.item.articleNumber} · {b.item.name}
                      </span>
                    ) : null}
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeBlock(b.id)}
                    disabled={blocks.length === 1}
                    aria-label="Remove item block"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <FieldLabel help="openingBalance.itemName">Item *</FieldLabel>
                  <ItemPicker
                    value={b.item?.id}
                    onChange={(_, p) =>
                      updateBlock(b.id, { item: p, quantities: {} })
                    }
                    onCreateNew={() =>
                      updateBlock(b.id, { itemEditorOpen: true })
                    }
                  />
                </div>

                {b.item && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {b.item.articleNumber} — {b.item.name}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateBlock(b.id, { colorEditorOpen: true })
                        }
                      >
                        <Plus className="mr-1 size-3" /> Add color
                      </Button>
                    </div>
                    <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
                      {openingBalanceUsesVariantGrid(b.item) ? (
                        <VariantGrid
                          sizes={deriveSizes(b.item.variants ?? [])}
                          colors={b.item.colors}
                          quantities={b.quantities}
                          onChange={(next) =>
                            updateBlock(b.id, { quantities: next })
                          }
                        />
                      ) : (
                        <div className="space-y-2">
                          <ColorQuantityList
                            colors={b.item.colors}
                            values={b.quantities}
                            onChange={(next) =>
                              updateBlock(b.id, { quantities: next })
                            }
                          />
                          <p className="text-xs text-muted-foreground">
                            Quantities are per color. Stock is recorded as
                            size {openingBalanceImplicitSize(b.item)}.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel help="openingBalance.costPerUnit">
                      Unit cost (UGX) *
                    </FieldLabel>
                    <MoneyInput
                      currency="UGX"
                      roundTo={50}
                      decimals={2}
                      value={b.unitCostUgx}
                      onChange={(v) => updateBlock(b.id, { unitCostUgx: v })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <FieldLabel>Block total</FieldLabel>
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-mono">{units}</span>{' '}
                      <span className="text-muted-foreground">units ×</span>{' '}
                      <span className="font-mono">
                        {b.unitCostUgx
                          ? roundUgxBankers50(b.unitCostUgx).toFormat(0)
                          : '0'}
                      </span>{' '}
                      <span className="text-muted-foreground">=</span>{' '}
                      <span className="font-mono font-semibold">
                        {roundUgxBankers50(value).toFormat(0)}
                      </span>{' '}
                      <span className="text-muted-foreground">UGX</span>
                    </div>
                  </div>
                </div>

                {/* Per-block dialogs */}
                <Dialog
                  open={b.itemEditorOpen}
                  onOpenChange={(open) =>
                    updateBlock(b.id, { itemEditorOpen: open })
                  }
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New item</DialogTitle>
                    </DialogHeader>
                    <ItemEditor
                      categories={categories}
                      onCreated={(_id, articleNumber) => {
                        updateBlock(b.id, { itemEditorOpen: false })
                        void refreshBlockItem(b.id, articleNumber)
                      }}
                    />
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={b.colorEditorOpen}
                  onOpenChange={(open) =>
                    updateBlock(b.id, { colorEditorOpen: open })
                  }
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add color</DialogTitle>
                    </DialogHeader>
                    {b.item && (
                      <ColorEditor
                        itemId={b.item.id}
                        onCreated={() => {
                          updateBlock(b.id, { colorEditorOpen: false })
                          if (b.item) {
                            void refreshBlockItem(b.id, b.item.articleNumber)
                          }
                        }}
                      />
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={addBlock}>
            <Plus className="mr-1 h-4 w-4" />
            Add Item
          </Button>
          <div className="text-sm text-muted-foreground">
            {validCount} of {blocks.length} item
            {blocks.length === 1 ? '' : 's'} valid · {totalUnits} units · Total:{' '}
            <span className="font-mono font-semibold text-foreground">
              {roundUgxBankers50(total).toFormat(0)}
            </span>{' '}
            UGX
          </div>
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-3 md:static md:mx-0 md:mb-0 md:border-t-0 md:bg-transparent md:p-0 md:flex md:justify-end">
          <Button
            className="h-12 w-full md:h-10 md:w-auto"
            disabled={!canSubmit || pending}
            onClick={() => setConfirmOpen(true)}
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
                <span className="font-semibold">{validCount}</span> item
                {validCount === 1 ? '' : 's'} totaling{' '}
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
                {pending ? 'Posting...' : 'Confirm & Post'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
