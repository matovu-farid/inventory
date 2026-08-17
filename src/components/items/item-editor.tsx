import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Textarea } from '#/components/ui/textarea'
import { Badge } from '#/components/ui/badge'
import { CreatableCombobox } from '#/components/ui/creatable-combobox'
import { ChevronDown, X } from 'lucide-react'
import {
  createItem,
  listItems,
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
import { suggestArticleNumber } from '#/lib/items/article-number'
import { CreateSupplierDialog } from '#/components/supply/create-supplier-dialog'
import type { CreatedSupplierOption } from '#/components/supply/create-supplier-dialog'

const SIZE_QUICK_PICKS = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

interface Props {
  categories: ReadonlyArray<string>
  suppliers?: ReadonlyArray<{ id: string; name: string }>
  allowCreateSupplier?: boolean
  createSubmitLabel?: string
  beforeSubmitContent?: ReactNode
  onCreated?: (itemId: string, articleNumber: string) => void
  item?: {
    id: string
    articleNumber: string
    name: string
    description?: string | null
    category: string
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

interface ColorDraft {
  colorName: string
  colorHex: string
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
  categories,
  suppliers: suppliedSuppliers,
  allowCreateSupplier = false,
  createSubmitLabel = 'Create item',
  beforeSubmitContent,
  onCreated,
  item,
  onUpdated,
}: Props) {
  const [articleNumber, setArticleNumber] = useState(item?.articleNumber ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
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
  const articleNumberEdited = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [minimumSellPriceError, setMinimumSellPriceError] = useState<
    string | null
  >(null)
  const [existingArticleNumbers, setExistingArticleNumbers] = useState<
    ReadonlySet<string>
  >(new Set())
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
    if (!item) return
    setArticleNumber(item.articleNumber)
    setName(item.name)
    setDescription(item.description ?? '')
    setCategory(item.category)
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
    articleNumberEdited.current = true
  }, [item])

  useEffect(() => {
    void listItems()
      .then((records) => {
        setExistingArticleNumbers(
          new Set(
            records
              .filter((record) => record.id !== item?.id)
              .map((record) => record.articleNumber),
          ),
        )
      })
      .catch((err: unknown) => setError(getSafeErrorMessage(err)))
  }, [item?.id])

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
    if (!articleNumberEdited.current) {
      setArticleNumber(
        suggestArticleNumber({
          category,
          name: value,
          existingArticleNumbers,
        }),
      )
    }
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

  function handleCategoryChange(value: string) {
    setCategory(value)
    if (!articleNumberEdited.current) {
      setArticleNumber(
        suggestArticleNumber({
          category: value,
          name,
          existingArticleNumbers,
        }),
      )
    }
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
        const updated = await updateItem({
          data: {
            id: item.id,
            articleNumber,
            name,
            description,
            category: category.trim(),
            supplierId,
            costPrice,
            costCurrency,
            minimumSellPriceUgx,
            lowStockThreshold,
          },
        })
        onUpdated?.(updated.articleNumber)
      } else {
        const created = await createItem({
          data: {
            articleNumber,
            name,
            description: description || undefined,
            category: category.trim(),
            supplierId,
            costPrice,
            costCurrency,
            sizes,
            colors,
            minimumSellPriceUgx,
            lowStockThreshold,
          },
        })
        onCreated?.(created.id, created.articleNumber)
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
        <div className="space-y-2">
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
          />
        </div>
        <div className="space-y-1">
          <FieldLabel help="itemForm.category">Category</FieldLabel>
          <CreatableCombobox
            options={categories}
            value={category}
            onChange={handleCategoryChange}
            placeholder="Pick or type a category"
            searchPlaceholder="Search categories…"
            emptyMessage="Type to create a new category."
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <FieldLabel help="item.name">Item name</FieldLabel>
          <Input
            className="h-11 text-base"
            value={name}
            onChange={(e) => handleItemNameChange(e.target.value)}
            placeholder="Crew-neck T-shirt"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel help="item.articleNumber">Article number</FieldLabel>
          <Input
            className="h-11 text-base"
            value={articleNumber}
            onChange={(e) => {
              articleNumberEdited.current = true
              setArticleNumber(e.target.value)
            }}
            placeholder="Generated after category and name"
          />
          <p className="text-xs text-muted-foreground">
            Suggested automatically; edit it if your catalog uses a different
            code.
          </p>
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
          <FieldLabel help="item.sizes">Sizes (optional)</FieldLabel>
          <p className="text-sm text-muted-foreground">
            Optional. Add sizes if you want to track stock by size. You can also
            add them later from the item detail page or while receiving.
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
                <Badge key={s} variant="secondary" className="gap-1">
                  {s}
                  <button
                    type="button"
                    onClick={() => setSizes(sizes.filter((x) => x !== s))}
                    aria-label={`remove ${s}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
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
        <div className="space-y-2">
          <FieldLabel help="item.initialColors">
            Initial colors (optional)
          </FieldLabel>
          <p className="text-sm text-muted-foreground">
            Optional. Add colors if you want to track stock by color. You can
            also add them later from this page or while receiving.{' '}
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
                  onClick={() =>
                    setColors(colors.filter((x) => x.colorName !== c.colorName))
                  }
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
            !articleNumber ||
            !name ||
            !category.trim() ||
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
