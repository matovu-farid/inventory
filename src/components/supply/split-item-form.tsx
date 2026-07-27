import * as React from 'react'
import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { FieldLabel } from '#/components/ui/field-label'
import { MoneyInput } from '#/components/ui/money-input'
import { VariantGrid } from '#/components/items/variant-grid'
import { deriveSizes } from '#/lib/variants'
import { getItemByArticle } from '#/server/functions/items/items'
import { splitSupplyRouteItem } from '#/server/functions/supply/items'
import type { ItemSummary } from '#/components/items/item-picker'

export interface SplittableItem {
  id: string
  quantity: number
  product?: { articleNumber: string; name: string } | null
  itemColor?: {
    id: string
    colorName: string
    colorHex: string
    item: { articleNumber: string; name: string }
  } | null
  size: string | null
}

export function SplitItemForm({
  item,
  onSuccess,
}: {
  item: SplittableItem
  onSuccess: () => void
}) {
  const articleNumber =
    item.itemColor?.item.articleNumber ?? item.product?.articleNumber
  const [product, setProduct] = useState<ItemSummary | undefined>()
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'colors' | 'variants'>(
    item.itemColor ? 'variants' : 'variants',
  )
  const [colorQtys, setColorQtys] = useState<Record<string, number>>({})
  const [cellQtys, setCellQtys] = useState<Record<string, number>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the product so we know the available colors + sizes.

  React.useEffect(() => {
    if (!articleNumber) {
      setLoading(false)
      return
    }
    void (async () => {
      const p = await getItemByArticle({ data: { articleNumber } })
      if (p) setProduct(p)
      setLoading(false)
    })()
  }, [articleNumber])

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading product…</p>
  }
  if (!product) {
    return <p className="text-sm text-destructive">Could not load product</p>
  }

  // For color-only items, the color is already fixed.
  const lockedColor = item.itemColor ?? null
  const colorsToUse = lockedColor ? [lockedColor] : product.colors

  const allCells: Array<{
    itemColorId: string
    size?: string
    quantity: number
  }> =
    mode === 'colors'
      ? Object.entries(colorQtys)
          .filter(([, q]) => q > 0)
          .map(([colorId, q]) => ({ itemColorId: colorId, quantity: q }))
      : Object.entries(cellQtys)
          .filter(([, q]) => q > 0)
          .map(([key, q]) => {
            const [itemColorId, size] = key.split('|')
            return { itemColorId, size, quantity: q }
          })

  const total = allCells.reduce((s, c) => s + c.quantity, 0)
  const mismatch = total !== item.quantity

  async function submit() {
    if (allCells.length === 0 || mismatch) return
    setPending(true)
    setError(null)
    try {
      await splitSupplyRouteItem({
        data: { itemId: item.id, cells: allCells },
      })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to split')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/40 p-3 text-sm">
        <p>
          <span className="font-medium">{product.articleNumber}</span> —{' '}
          {product.name}
        </p>
        <p className="text-muted-foreground">
          Original quantity: <span className="font-mono">{item.quantity}</span>
          {lockedColor ? (
            <>
              {' · Color locked to '}
              <span className="font-medium">{lockedColor.colorName}</span>
            </>
          ) : null}
        </p>
      </div>

      {!lockedColor && (
        <div className="space-y-1.5">
          <FieldLabel help="item.detailMode">Split into</FieldLabel>
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('colors')}
              className={
                'px-3 py-1.5 rounded transition-colors ' +
                (mode === 'colors'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted')
              }
            >
              Colors only
            </button>
            <button
              type="button"
              onClick={() => setMode('variants')}
              className={
                'px-3 py-1.5 rounded transition-colors ' +
                (mode === 'variants'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted')
              }
            >
              Colors × sizes
            </button>
          </div>
        </div>
      )}

      {mode === 'colors' && !lockedColor && (
        <ColorQuantityList
          colors={product.colors}
          values={colorQtys}
          onChange={setColorQtys}
        />
      )}

      {(mode === 'variants' || lockedColor) && (
        <VariantGrid
          sizes={deriveSizes(product.variants ?? [])}
          colors={colorsToUse}
          quantities={cellQtys}
          onChange={setCellQtys}
        />
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Allocated: <span className="font-mono">{total}</span> of{' '}
          <span className="font-mono">{item.quantity}</span>
        </span>
        {mismatch && (
          <span className="text-destructive">Must equal {item.quantity}</span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={() => {
          void submit()
        }}
        disabled={pending || mismatch || allCells.length === 0}
        className="w-full"
      >
        {pending ? 'Splitting…' : 'Save split'}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Color quantity list — Per-color procurement input                   */
/* ------------------------------------------------------------------ */

export function ColorQuantityList({
  colors,
  values,
  onChange,
  onRemoveColor,
  error,
}: {
  colors: Array<{ id: string; colorName: string; colorHex: string }>
  values: Record<string, number>
  onChange: (v: Record<string, number>) => void
  onRemoveColor?: (colorId: string) => void
  error?: string
}) {
  if (colors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add at least one color to enter quantities.
      </p>
    )
  }
  function set(colorId: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    const next = { ...values, [colorId]: n }
    if (n === 0) delete next[colorId]
    onChange(next)
  }
  const total = Object.values(values).reduce((s, n) => s + n, 0)
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded border">
        <table className="w-full text-sm">
          <tbody>
            {colors.map((c) => (
              <tr key={c.id} className="border-t first:border-t-0">
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block size-4 rounded border"
                      style={{ backgroundColor: c.colorHex }}
                      aria-hidden
                    />
                    {c.colorName}
                  </span>
                </td>
                <td className="p-1.5 w-32">
                  <MoneyInput
                    value={c.id in values ? values[c.id].toString() : ''}
                    onChange={(v) => set(c.id, v)}
                    decimals={0}
                    placeholder="0"
                  />
                </td>
                {onRemoveColor && (
                  <td className="p-1 w-10 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${c.colorName}`}
                      onClick={() => onRemoveColor(c.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Total units: <span className="font-mono">{total}</span>
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
