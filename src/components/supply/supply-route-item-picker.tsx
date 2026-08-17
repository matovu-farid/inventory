import { useEffect, useState } from 'react'
import { restoreItem, searchItems } from '#/server/functions/items/items'
import { Combobox } from '#/components/ui/combobox'
import type { ComboboxOption } from '#/components/ui/combobox'
import type { ItemSummary } from '#/components/items/item-picker'

interface Props {
  value?: string
  onChange: (itemId: string, item: ItemSummary | undefined) => void
  allowArchived?: boolean
}

export function SupplyRouteItemPicker({
  value,
  onChange,
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
      .then((items) =>
        setResults(Array.isArray(items) ? (items as ItemSummary[]) : []),
      )
      .catch((err: unknown) => {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Could not load items. Please try again.',
        )
      })
  }, [showArchived])

  const options: ComboboxOption[] = results.map((item) => ({
    value: item.id,
    label: `${item.deletedAt ? '[Archived] ' : ''}${item.articleNumber} — ${item.name}`,
  }))

  return (
    <div className="space-y-1">
      <Combobox
        options={options}
        value={value}
        onChange={(id) => {
          const selected = results.find((item) => item.id === id)
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
        emptyMessage="No matching item."
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
