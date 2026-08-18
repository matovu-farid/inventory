import { useEffect, useState } from 'react'
import { restoreItem, searchItems } from '#/server/functions/items/items'
import { Combobox } from '#/components/ui/combobox'
import type { ComboboxOption } from '#/components/ui/combobox'

export interface ItemSummary {
  id: string
  articleNumbers: Array<{ id: string; articleNumber: string }>
  name: string
  design: string
  description?: string | null
  costPrice?: string | null
  costCurrency?: 'RMB' | 'USD' | 'UGX' | string | null
  supplier?: { id: string; name: string } | null
  minimumSellPriceUgx?: string
  deletedAt?: Date | string | null
  colors: Array<{
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
  }>
  /**
   * Every materialised variant for this item. Consumers that pick a
   * (color, size) cell — opening balance, supply route editor — use
   * this to translate that pair back to a `variantId` (the unit of
   * stock since #4 / #5 / #6). After issue #7 dropped `items.sizes`,
   * this is also the source for "what sizes does this item come in" —
   * call `deriveSizes(p.variants)` to render the size grid.
   *
   * Optional so callers that don't fetch variants still compile.
   */
  variants?: Array<{ id: string; colorId: string; size: string }>
}

interface Props {
  value?: string
  onChange: (itemId: string, item: ItemSummary | undefined) => void
  onCreateNew?: () => void
  allowArchived?: boolean
}

export function ItemPicker({
  value,
  onChange,
  onCreateNew,
  allowArchived = false,
}: Props) {
  const [results, setResults] = useState<ItemSummary[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    void searchItems({
      data: { query: '', includeArchived: showArchived },
    })
      .then((rs) => setResults(Array.isArray(rs) ? (rs as ItemSummary[]) : []))
      .catch((err: unknown) => {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Could not load items. Please try again.',
        )
      })
  }, [showArchived])

  const options: ComboboxOption[] = results.map((p) => ({
    value: p.id,
    label: `${p.deletedAt ? '[Archived] ' : ''}${p.articleNumbers.map((number) => number.articleNumber).join(', ')} — ${p.name}`,
  }))

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(id) => {
          const selected = results.find((r) => r.id === id)
          if (!selected) return
          if (selected.deletedAt) {
            if (!window.confirm(`Restore ${selected.name} before using it?`)) {
              return
            }
            void restoreItem({ data: { id: selected.id } })
              .then(() => {
                const restored = { ...selected, deletedAt: null }
                setResults((current) =>
                  current.map((item) =>
                    item.id === restored.id ? restored : item,
                  ),
                )
                setError(null)
                onChange(restored.id, restored)
              })
              .catch((err: unknown) => {
                setError(
                  err instanceof Error && err.message
                    ? err.message
                    : 'Could not restore this item. Please try again.',
                )
              })
            return
          }
          setError(null)
          onChange(id, selected)
        }}
        placeholder="Select item…"
        searchPlaceholder="Type article number…"
        emptyMessage={
          <div className="p-2 text-sm">
            No matching item.{' '}
            {onCreateNew && (
              <button
                type="button"
                onClick={onCreateNew}
                className="font-medium underline"
              >
                Create new
              </button>
            )}
          </div>
        }
      />
      {allowArchived && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowArchived((current) => !current)}
        >
          {showArchived ? 'Hide archived items' : 'Search archived items'}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
