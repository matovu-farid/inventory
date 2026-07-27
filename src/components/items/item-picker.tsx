import { useEffect, useState } from 'react'
import { searchItems } from '#/server/functions/items/items'
import { Combobox } from '#/components/ui/combobox'
import type { ComboboxOption } from '#/components/ui/combobox'

export interface ItemSummary {
  id: string
  articleNumber: string
  name: string
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
}

export function ItemPicker({ value, onChange, onCreateNew }: Props) {
  const [results, setResults] = useState<ItemSummary[]>([])

  useEffect(() => {
    void searchItems({ data: { query: '' } }).then((rs) =>
      setResults(rs as ItemSummary[]),
    )
  }, [])

  const options: ComboboxOption[] = results.map((p) => ({
    value: p.id,
    label: `${p.articleNumber} — ${p.name}`,
  }))

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(id) =>
          onChange(
            id,
            results.find((r) => r.id === id),
          )
        }
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
    </div>
  )
}
