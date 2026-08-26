import { useMemo, useState } from 'react'
import { deriveSizes } from '#/lib/variants'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { GridCellKind  } from '@glideapps/glide-data-grid'
import type {TextCell} from '@glideapps/glide-data-grid';
import type { ReceiptGridCatalogItem } from './types'

export function SizeCellEditor({
  initialValue,
  catalogItem,
  onFinishedEditing,
  onChange,
}: {
  initialValue: string
  catalogItem: ReceiptGridCatalogItem | null
  onFinishedEditing: (
    value?: TextCell,
    movement?: readonly [-1 | 0 | 1, -1 | 0 | 1],
  ) => void
  onChange: (value: TextCell) => void
}) {
  const [value, setValue] = useState(initialValue)
  const sizes = useMemo(() => deriveSizes(catalogItem?.variants ?? []), [catalogItem])
  const selected = new Set(value.split(',').map((item) => item.trim().toLocaleLowerCase()).filter(Boolean))

  function toggle(size: string) {
    const next = new Set(selected)
    const key = size.toLocaleLowerCase()
    if (next.has(key)) next.delete(key)
    else next.add(key)
    const text = sizes.filter((item) => next.has(item.toLocaleLowerCase())).join(', ')
    setValue(text)
    onChange({ kind: GridCellKind.Text, allowOverlay: true, data: text, displayData: text })
  }

  function finish() {
    const next: TextCell = { kind: GridCellKind.Text, allowOverlay: true, data: value, displayData: value }
    onChange(next)
    onFinishedEditing(next)
  }

  return (
    <div className="w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex flex-wrap gap-1.5">
        {sizes.map((size) => (
          <Button
            key={size}
            type="button"
            size="sm"
            variant={selected.has(size.toLocaleLowerCase()) ? 'default' : 'outline'}
            onClick={() => toggle(size)}
          >
            {size}
          </Button>
        ))}
      </div>
      <Input
        className="mt-2"
        value={value}
        placeholder="S, M, L"
        onChange={(event) => {
          setValue(event.target.value)
          onChange({ kind: GridCellKind.Text, allowOverlay: true, data: event.target.value, displayData: event.target.value })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish()
          if (event.key === 'Escape') onFinishedEditing()
        }}
      />
      <Button type="button" className="mt-2 w-full" onClick={finish}>
        Done
      </Button>
    </div>
  )
}
