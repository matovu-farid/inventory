import { useEffect, useRef, useState } from 'react'
import { searchItems } from '#/server/functions/items/items'
import { Input } from '#/components/ui/input'
import { GridCellKind  } from '@glideapps/glide-data-grid'
import type {TextCell} from '@glideapps/glide-data-grid';
import type { ReceiptGridCatalogItem } from './types'

export function DesignCellEditor({
  value,
  onChange,
  onFinishedEditing,
  onCatalogItemSelected,
}: {
  value: TextCell
  onChange: (value: TextCell) => void
  onFinishedEditing: (
    value?: TextCell,
    movement?: readonly [-1 | 0 | 1, -1 | 0 | 1],
  ) => void
  onCatalogItemSelected: (item: ReceiptGridCatalogItem) => void
}) {
  const [query, setQuery] = useState(value.data)
  const [results, setResults] = useState<ReceiptGridCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const searchSequence = useRef(0)

  useEffect(() => {
    const sequence = ++searchSequence.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchItems({ data: { query } })
        .then((items) => {
          if (sequence === searchSequence.current) {
            setResults(items)
          }
        })
        .catch(() => {
          if (sequence === searchSequence.current) setResults([])
        })
        .finally(() => {
          if (sequence === searchSequence.current) setLoading(false)
        })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [query])

  function finish(text: string) {
    const next: TextCell = {
      kind: GridCellKind.Text,
      allowOverlay: true,
      data: text,
      displayData: text,
    }
    onChange(next)
    onFinishedEditing(next)
  }

  return (
    <div className="w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-lg">
      <Input
        autoFocus
        aria-label="Design or art number"
        name="receipt-design"
        value={query}
        placeholder="Type a design or art no."
        onChange={(event) => {
          setQuery(event.target.value)
          onChange({ kind: GridCellKind.Text, allowOverlay: true, data: event.target.value, displayData: event.target.value })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish(query.trim())
          if (event.key === 'Escape') onFinishedEditing()
        }}
      />
      <div className="mt-2 max-h-48 overflow-y-auto">
        {loading && (
          <p className="px-2 py-1 text-xs text-muted-foreground">Searching…</p>
        )}
        {!loading && query.trim() && results.length === 0 && (
          <button
            type="button"
            className="w-full rounded px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={() => finish(query.trim())}
          >
            Use “{query.trim()}” as a receipt-only design
          </button>
        )}
        {results.map((item) => (
          <button
            type="button"
            key={item.id}
            className="w-full rounded px-2 py-2 text-left text-sm hover:bg-muted"
            onClick={() => {
              onCatalogItemSelected(item)
              finish(item.design || item.name)
            }}
          >
            <span className="block font-medium">{item.design || item.name}</span>
            <span className="block text-xs text-muted-foreground">
              {item.articleNumbers.map((number) => number.articleNumber).join(', ')}
              {item.design && item.name !== item.design ? ` · ${item.name}` : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
