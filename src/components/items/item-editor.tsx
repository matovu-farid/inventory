import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Badge } from '#/components/ui/badge'
import { ChevronDown, X } from 'lucide-react'
import {
  createItem,
  replaceItemArticleNumbers,
  updateItem,
} from '#/server/functions/items/items'
import { listSuppliersForSelect } from '#/server/functions/supply/routes'
import { matchPaletteHex } from '#/lib/colors/match-palette'
import { CLOTHING_PALETTE } from '#/lib/colors/palette'
import { HexColorField } from './hex-color-field'
import { InfoPopover } from '#/components/ui/info-popover'
import { FieldLabel } from '#/components/ui/field-label'
import { MoneyInput } from '#/components/ui/money-input'
import { Combobox } from '#/components/ui/combobox'
import { normalizeArticleNumber } from '#/lib/items/article-number'
import { CreateSupplierDialog } from '#/components/supply/create-supplier-dialog'
import type { CreatedSupplierOption } from '#/components/supply/create-supplier-dialog'

const SIZE_QUICK_PICKS = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

export interface ColorDraft {
  id?: string
  colorName: string
  colorHex: string
}

export interface ItemEditorDraft {
  supplierId: string
  costCurrency: 'RMB' | 'USD' | 'UGX'
  colors: ColorDraft[]
  sizes: string[]
}

interface Props {
  suppliers?: ReadonlyArray<{ id: string; name: string }>
  allowCreateSupplier?: boolean
  createSubmitLabel?: string
  beforeSubmitContent?: ReactNode
  beforeSubmit?: () => boolean | void | Promise<boolean | void>
  onDraftChange?: (draft: ItemEditorDraft) => void
  onCreated?: (itemId: string, articleNumber: string) => void | Promise<void>
  item?: {
    id: string
    articleNumbers: Array<{ id: string; articleNumber: string }>
    name: string
    description?: string | null
    design: string
    supplier?: { id: string; name: string } | null
    costPrice?: string | null
    costCurrency?: string | null
    minimumSellPriceUgx?: string | null
    lowStockThreshold?: number | null
    colors?: ColorDraft[]
    variants?: Array<{ size: string }>
  }
  onUpdated?: (articleNumber: string) => void
}

function ItemEditorPill({ children }: { children: ReactNode }) {
  return (
    <Badge variant="secondary" className="gap-1 px-3 py-1 text-sm">
      {children}
    </Badge>
  )
}

const MINIMUM_SELL_PRICE_ERROR = 'Minimum sell price must be positive'

function getValidationMessage(error: unknown, field: string): string | null {
  if (!(error instanceof Error)) return null

  try {
    const issues: unknown = JSON.parse(error.message)
    if (!Array.isArray(issues)) return null

    const issue = issues.find((candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') return false
      const record = candidate as Record<string, unknown>
      return (
        Array.isArray(record.path) &&
        record.path.at(-1) === field &&
        typeof record.message === 'string'
      )
    }) as Record<string, unknown> | undefined

    return typeof issue?.message === 'string' ? issue.message : null
  } catch {
    return null
  }
}

function getSafeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Failed to save item.'

  try {
    if (Array.isArray(JSON.parse(error.message))) {
      return 'Please review the highlighted fields.'
    }
  } catch {
    // Use the original message for regular server errors.
  }

  return error.message || 'Failed to save item.'
}

/**
 * Item create form. After issue #7 the server no longer persists
 * `items.sizes`; this editor collects sizes (and optional colors) so
 * the server can materialize the (color × size) cross-product into
 * the variants table when saving.
 */
export function ItemEditor({
  suppliers: suppliedSuppliers,
  allowCreateSupplier = false,
  createSubmitLabel = 'Create item',
  beforeSubmitContent,
  beforeSubmit,
  onDraftChange,
  onCreated,
  item,
  onUpdated,
}: Props) {
  const [articleNumbers, setArticleNumbers] = useState<string[]>(
    item?.articleNumbers.map((number) => number.articleNumber) ?? [],
  )
  const [articleNumberDraft, setArticleNumberDraft] = useState('')
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [design, setDesign] = useState(item?.design ?? '')
  const [supplierId, setSupplierId] = useState(item?.supplier?.id ?? '')
  const [suppliers, setSuppliers] = useState<
    ReadonlyArray<{ id: string; name: string }>
  >(suppliedSuppliers ?? [])
  const [costPrice, setCostPrice] = useState(item?.costPrice ?? '')
  const [costCurrency, setCostCurrency] = useState<'RMB' | 'USD' | 'UGX'>(
    item?.costCurrency === 'USD' || item?.costCurrency === 'UGX'
      ? item.costCurrency
      : 'RMB',
  )
  const [minimumSellPriceUgx, setMinimumSellPriceUgx] = useState<string>(
    item?.minimumSellPriceUgx ?? '',
  )
  const [lowStockThreshold, setLowStockThreshold] = useState<number | null>(
    item?.lowStockThreshold ?? null,
  )
  const [sizes, setSizes] = useState<string[]>(
    item?.variants
      ? [...new Set(item.variants.map((variant) => variant.size))]
      : [],
  )
  const [sizeDraft, setSizeDraft] = useState('')
  const [colors, setColors] = useState<ColorDraft[]>(item?.colors ?? [])
  const [colorNameDraft, setColorNameDraft] = useState('')
  const [colorHexDraft, setColorHexDraft] = useState('#000000')
  const lastSuggestedName = useRef<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [createdItemId, setCreatedItemId] = useState<string | null>(null)
  const [createdArticleNumber, setCreatedArticleNumber] = useState<
    string | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [minimumSellPriceError, setMinimumSellPriceError] = useState<
    string | null
  >(null)
  const [commercialProfileOpen, setCommercialProfileOpen] = useState(true)
  const [variantsOpen, setVariantsOpen] = useState(true)
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false)
  const [supplierCreateName, setSupplierCreateName] = useState('')

  useEffect(() => {
    if (suppliedSuppliers) {
      setSuppliers(suppliedSuppliers)
      return
    }
    void listSuppliersForSelect()
      .then(setSuppliers)
      .catch((err: unknown) => setError(getSafeErrorMessage(err)))
  }, [suppliedSuppliers])

  useEffect(() => {
    onDraftChange?.({ supplierId, costCurrency, colors, sizes })
  }, [colors, costCurrency, onDraftChange, sizes, supplierId])

  useEffect(() => {
    if (!item) return
    const nextArticleNumbers = item.articleNumbers.map(
      (number) => number.articleNumber,
    )
    setArticleNumbers(nextArticleNumbers)
    setName(item.name)
    setDescription(item.description ?? '')
    setDesign(item.design)
    setSupplierId(item.supplier?.id ?? '')
    setCostPrice(item.costPrice ?? '')
    setCostCurrency(
      item.costCurrency === 'USD' || item.costCurrency === 'UGX'
        ? item.costCurrency
        : 'RMB',
    )
    setMinimumSellPriceUgx(item.minimumSellPriceUgx ?? '')
    setLowStockThreshold(item.lowStockThreshold ?? null)
    setSizes(
      item.variants
        ? [...new Set(item.variants.map((variant) => variant.size))]
        : [],
    )
    setColors(item.colors ?? [])
  }, [item])

  function handleHexChange(hex: string) {
    setColorHexDraft(hex)
    const suggested = matchPaletteHex(hex).name
    const current = colorNameDraft.trim()
    if (current === '' || current === lastSuggestedName.current) {
      setColorNameDraft(suggested)
      lastSuggestedName.current = suggested
    } else {
      lastSuggestedName.current = suggested
    }
  }

  function handleNameChange(value: string) {
    setColorNameDraft(value)
    const tile = CLOTHING_PALETTE.find(
      (t) => t.name.toLowerCase() === value.trim().toLowerCase(),
    )
    if (tile) {
      setColorHexDraft(tile.hex)
      lastSuggestedName.current = tile.name
    }
  }

  function handleItemNameChange(value: string) {
    setName(value)
  }

  function handleSupplierCreated(supplier: CreatedSupplierOption) {
    setSuppliers((current) =>
      [...current.filter((option) => option.id !== supplier.id), supplier].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    )
    setSupplierId(supplier.id)
    setSupplierCreateName('')
    setSupplierDialogOpen(false)
  }

  function addArticleNumber(raw: string) {
    let normalized: string
    try {
      normalized = normalizeArticleNumber(raw)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Article number is required',
      )
      return
    }
    if (articleNumbers.includes(normalized)) {
      setError('Article numbers must be unique')
      return
    }
    setArticleNumbers((current) => [...current, normalized])
    setArticleNumberDraft('')
    setError(null)
  }

  function addSizes(raw: string) {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setSizes((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.includes(p)) next.push(p)
      }
      return next
    })
    setSizeDraft('')
  }

  function addColor() {
    const cn = colorNameDraft.trim()
    if (!cn || colors.some((c) => c.colorName === cn)) return
    if (!/^#[0-9a-fA-F]{6}$/.test(colorHexDraft)) return
    setColors([...colors, { colorName: cn, colorHex: colorHexDraft }])
    setColorNameDraft('')
  }

  async function save() {
    try {
      const canSubmit = await beforeSubmit?.()
      if (canSubmit === false) return
    } catch (e) {
      setError(getSafeErrorMessage(e))
      return
    }

    setSubmitting(true)
    setError(null)
    setMinimumSellPriceError(null)

    const minimumSellPrice = Number(minimumSellPriceUgx)
    if (!Number.isFinite(minimumSellPrice) || minimumSellPrice <= 0) {
      setMinimumSellPriceError(MINIMUM_SELL_PRICE_ERROR)
      setSubmitting(false)
      return
    }

    try {
      if (item) {
        await updateItem({
          data: {
            id: item.id,
            name,
            description,
            design: design.trim(),
            supplierId,
            costPrice,
            costCurrency,
            minimumSellPriceUgx,
            lowStockThreshold,
          },
        })
        await replaceItemArticleNumbers({
          data: { itemId: item.id, articleNumbers },
        })
        onUpdated?.(articleNumbers[0] ?? '')
      } else {
        let itemId = createdItemId
        let itemArticleNumber = createdArticleNumber
        if (!itemId || !itemArticleNumber) {
          const created = await createItem({
            data: {
              name,
              design: design.trim(),
              articleNumbers,
              description: description || undefined,
              supplierId,
              costPrice,
              costCurrency,
              sizes,
              colors,
              minimumSellPriceUgx,
              lowStockThreshold,
            },
          })
          itemId = created.id
          const createdArticleNumbers = Array.isArray(created.articleNumbers)
            ? created.articleNumbers
            : []
          itemArticleNumber =
            createdArticleNumbers[0]?.qualifiedArticleNumber ||
            articleNumbers[0] ||
            ''
          setCreatedItemId(itemId)
          setCreatedArticleNumber(itemArticleNumber)
        }
        await onCreated?.(itemId, itemArticleNumber)
      }
    } catch (e) {
      const validationMessage = getValidationMessage(e, 'minimumSellPriceUgx')
      if (validationMessage) {
        setMinimumSellPriceError(validationMessage)
      } else {
        setError(getSafeErrorMessage(e))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel>Current supplier</FieldLabel>
          <Combobox
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={supplierId}
            onChange={setSupplierId}
            onCreateNew={
              allowCreateSupplier
                ? (value) => {
                    setSupplierCreateName(value)
                    setSupplierDialogOpen(true)
                  }
                : undefined
            }
            placeholder="Select supplier"
            searchPlaceholder="Search suppliers…"
            emptyMessage="Create a supplier before creating an item."
            triggerClassName="h-11 text-base"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel help="item.name">Item name</FieldLabel>
          <Input
            className="h-11 text-base"
            value={name}
            onChange={(e) => handleItemNameChange(e.target.value)}
            placeholder="T-shirt"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel help="item.design">Design</FieldLabel>
          <Input
            className="h-11 text-base"
            value={design}
            onChange={(e) => setDesign(e.target.value)}
            placeholder="Round neck"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel help="item.articleNumbers">Article numbers</FieldLabel>
          <div className="flex gap-2">
            <Input
              className="h-11 text-base"
              value={articleNumberDraft}
              onChange={(e) => setArticleNumberDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addArticleNumber(articleNumberDraft)
                }
              }}
              placeholder="Enter an article number"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 text-base"
              onClick={() => addArticleNumber(articleNumberDraft)}
            >
              Add
            </Button>
          </div>
          {articleNumbers.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {articleNumbers.map((number) => (
                <ItemEditorPill key={number}>
                  {number}
                  <button
                    type="button"
                    onClick={() => {
                      if (articleNumbers.length === 1) {
                        setError(
                          'An item must have at least one article number',
                        )
                        return
                      }
                      setArticleNumbers((current) =>
                        current.filter((value) => value !== number),
                      )
                    }}
                    aria-label={`remove ${number}`}
                  >
                    <X className="size-3" />
                  </button>
                </ItemEditorPill>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <FieldLabel help="item.description">Description (optional)</FieldLabel>
        <Textarea
          className="text-base"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <details
        open={commercialProfileOpen}
        onToggle={(event) => setCommercialProfileOpen(event.currentTarget.open)}
        className="space-y-3 rounded-md border p-3"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${commercialProfileOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          Commercial profile
        </summary>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel>Current supplier cost</FieldLabel>
            <MoneyInput
              value={costPrice}
              onChange={setCostPrice}
              currency={costCurrency}
              decimals={costCurrency === 'UGX' ? 0 : 2}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Cost currency</FieldLabel>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={costCurrency}
              onChange={(e) =>
                setCostCurrency(e.target.value as typeof costCurrency)
              }
            >
              <option value="RMB">RMB</option>
              <option value="USD">USD</option>
              <option value="UGX">UGX</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel help="item.minSellPrice">
              Minimum sell price (UGX)
            </FieldLabel>
            <MoneyInput
              value={minimumSellPriceUgx}
              onChange={(v) => {
                setMinimumSellPriceUgx(v)
                setMinimumSellPriceError(null)
              }}
              currency="UGX"
              decimals={0}
              roundTo={50}
              error={minimumSellPriceError ?? undefined}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel help="item.lowStockThreshold">
              Low-stock threshold
            </FieldLabel>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="No alert"
              value={lowStockThreshold ?? ''}
              onChange={(e) => {
                const v = e.target.value
                setLowStockThreshold(
                  v === '' ? null : Math.max(0, Math.floor(Number(v))),
                )
              }}
            />
          </div>
        </div>
      </details>
      <details
        open={variantsOpen}
        onToggle={(event) => setVariantsOpen(event.currentTarget.open)}
        className="space-y-3 rounded-md border p-3"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${variantsOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          Variants and colors
        </summary>
        <div className="space-y-2">
          <FieldLabel help="item.initialColors">
            Initial colors (optional)
          </FieldLabel>
          <p className="text-sm text-muted-foreground">
            Add at least one color before adding sizes so stock can be tracked
            by color and size. You can add more colors later.{' '}
            <InfoPopover term="item.variantsOptional" />
          </p>
          <div className="flex flex-wrap gap-1">
            {colors.map((c) => (
              <Badge
                key={c.colorName}
                variant="secondary"
                className="gap-1"
                style={{ borderColor: c.colorHex }}
              >
                <span
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: c.colorHex }}
                  aria-hidden
                />
                {c.colorName}
                <button
                  type="button"
                  onClick={() => {
                    const nextColors = colors.filter(
                      (x) => x.colorName !== c.colorName,
                    )
                    setColors(nextColors)
                    if (nextColors.length === 0) setSizes([])
                  }}
                  aria-label={`remove ${c.colorName}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="h-10 text-sm"
              value={colorNameDraft}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Color name (e.g. Burgundy)"
              list="clothing-palette-names"
            />
            <datalist id="clothing-palette-names">
              {CLOTHING_PALETTE.map((t) => (
                <option key={t.name} value={t.name} />
              ))}
            </datalist>
            <HexColorField
              value={colorHexDraft}
              onChange={handleHexChange}
              ariaLabel="Pick color"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addColor}
              disabled={!colorNameDraft.trim()}
            >
              Add color
            </Button>
          </div>
        </div>
        {colors.length > 0 && (
          <div className="space-y-2">
            <FieldLabel help="item.sizes">Sizes (optional)</FieldLabel>
            <p className="text-sm text-muted-foreground">
              Optional. Add sizes if you want to track stock by size. You can
              also add them later from the item detail page or while receiving.
            </p>
            <Input
              className="h-11 text-base"
              value={sizeDraft}
              onChange={(e) => setSizeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSizes(sizeDraft)
                }
              }}
              onBlur={() => {
                if (sizeDraft.trim()) addSizes(sizeDraft)
              }}
              placeholder="Type sizes separated by commas, then Enter"
            />
            {sizes.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sizes.map((s) => (
                  <ItemEditorPill key={s}>
                    {s}
                    <button
                      type="button"
                      onClick={() => setSizes(sizes.filter((x) => x !== s))}
                      aria-label={`remove ${s}`}
                    >
                      <X className="size-3" />
                    </button>
                  </ItemEditorPill>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {SIZE_QUICK_PICKS.filter((s) => !sizes.includes(s)).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addSizes(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
      </details>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {beforeSubmitContent}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={
            articleNumbers.length === 0 ||
            !name ||
            !design.trim() ||
            !supplierId ||
            !costPrice ||
            !minimumSellPriceUgx ||
            submitting
          }
        >
          {submitting ? 'Saving…' : item ? 'Save changes' : createSubmitLabel}
        </Button>
      </div>
      <CreateSupplierDialog
        open={supplierDialogOpen}
        initialName={supplierCreateName}
        onOpenChange={setSupplierDialogOpen}
        onCreated={handleSupplierCreated}
      />
    </div>
  )
}
