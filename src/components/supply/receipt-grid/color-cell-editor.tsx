import { useMemo, useState } from 'react'
import { GridCellKind } from '@glideapps/glide-data-grid'
import type { TextCell } from '@glideapps/glide-data-grid'
import { Check, Pipette } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { HexColorField } from '#/components/items/hex-color-field'
import { matchPaletteHex } from '#/lib/colors/match-palette'
import {
  getActiveColorIndex,
  getActiveColorQuery,
  normalizeColorHex,
  paletteReceiptColorOptions,
  splitColorSegments,
} from '#/lib/colors/receipt-colors'
import type { ReceiptGridCatalogItem } from './types'

type ColorOption = { id?: string; name: string; hex: string }

function cell(value: string): TextCell {
  return {
    kind: GridCellKind.Text,
    allowOverlay: true,
    data: value,
    displayData: value,
  }
}

export function ColorCellEditor({
  initialValue,
  initialHexValue = '',
  catalogItem,
  onFinishedEditing,
  onChange,
  onColorSelection,
}: {
  initialValue: string
  initialHexValue?: string
  catalogItem: ReceiptGridCatalogItem | null
  onFinishedEditing: (
    value?: TextCell,
    movement?: readonly [-1 | 0 | 1, -1 | 0 | 1],
  ) => void
  onChange: (value: TextCell) => void
  onColorSelection: (ids: string[], text: string, hexText: string) => void
}) {
  const [value, setValue] = useState(initialValue)
  const [hexValues, setHexValues] = useState(() =>
    initialHexValue
      ? initialHexValue.split(',').map((hex) => hex.trim())
      : [],
  )
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const segments = useMemo(() => splitColorSegments(value), [value])
  const selectedNames = useMemo(
    () => new Set(segments.map((name) => name.toLocaleLowerCase()).filter(Boolean)),
    [segments],
  )
  const options = useMemo<ColorOption[]>(() => {
    const seen = new Set<string>()
    const next: ColorOption[] = []
    for (const option of [
      ...(catalogItem?.colors ?? []).map((color) => ({ id: color.id, name: color.colorName, hex: color.colorHex })),
      ...paletteReceiptColorOptions(),
    ]) {
      const key = option.name.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(option)
    }
    return next
  }, [catalogItem])
  const query = getActiveColorQuery(value).toLocaleLowerCase()
  const suggestions = useMemo(
    () => query
      ? options.filter((option) => option.name.toLocaleLowerCase().includes(query)).slice(0, 8)
      : [],
    [options, query],
  )

  function selectionIds(nextValue: string): string[] {
    const names = new Set(splitColorSegments(nextValue).map((name) => name.toLocaleLowerCase()))
    return (catalogItem?.colors ?? [])
      .filter((option) => names.has(option.colorName.toLocaleLowerCase()))
      .map((option) => option.id)
  }

  function hexTextFor(names: string[], nextHexValues = hexValues): string {
    return names.map((_, index) => nextHexValues[index] ?? '').join(', ')
  }

  function commit(nextValue: string, nextHexValues = hexValues) {
    const nextHexText = hexTextFor(splitColorSegments(nextValue), nextHexValues)
    onColorSelection(selectionIds(nextValue), nextValue, nextHexText)
  }

  function selectOption(option: ColorOption) {
    const index = getActiveColorIndex(value)
    const nextSegments = [...segments]
    nextSegments[index] = option.name
    const nextValue = nextSegments.join(', ')
    const nextHexValues = [...hexValues]
    nextHexValues[index] = option.hex
    setValue(nextValue)
    setHexValues(nextHexValues)
    setHighlightedIndex(0)
    commit(nextValue, nextHexValues)
  }

  function toggle(option: ColorOption) {
    const key = option.name.toLocaleLowerCase()
    if (selectedNames.has(key)) {
      const nextSegments = segments.filter((name) => name.toLocaleLowerCase() !== key)
      const nextHexValues = nextSegments.map((_, index) => hexValues[index] ?? '')
      const nextValue = nextSegments.filter(Boolean).join(', ')
      setValue(nextValue)
      setHexValues(nextHexValues)
      commit(nextValue, nextHexValues)
      return
    }
    const activeQuery = getActiveColorQuery(value)
    const isExactOption = options.some(
      (candidate) => candidate.name.toLocaleLowerCase() === activeQuery.toLocaleLowerCase(),
    )
    if (activeQuery && !isExactOption) {
      selectOption(option)
      return
    }
    const nextSegments = [...segments.filter(Boolean), option.name]
    const nextHexValues = [
      ...nextSegments.slice(0, -1).map(
        (name) =>
          hexValues.at(nextSegments.indexOf(name)) ??
          options.find(
            (candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          )?.hex ??
          '',
      ),
      option.hex,
    ]
    const nextValue = nextSegments.join(', ')
    setValue(nextValue)
    setHexValues(nextHexValues)
    commit(nextValue, nextHexValues)
  }

  function handleHexChange(hex: string) {
    const normalizedHex = normalizeColorHex(hex)
    if (!normalizedHex) return
    const index = getActiveColorIndex(value)
    const nextSegments = [...segments]
    nextSegments[index] = matchPaletteHex(normalizedHex).name
    const nextHexValues = [...hexValues]
    nextHexValues[index] = normalizedHex
    const nextValue = nextSegments.join(', ')
    setValue(nextValue)
    setHexValues(nextHexValues)
  }

  function finish() {
    const next = cell(value)
    onChange(next)
    commit(value)
    onFinishedEditing(next)
  }

  const activeHex = hexValues[getActiveColorIndex(value)] ?? ''

  return (
    <div className="w-80 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Choose colours</p>
        <div className="flex items-center gap-1">
          <Pipette className="size-4 text-muted-foreground" aria-hidden="true" />
          <HexColorField value={activeHex} onChange={handleHexChange} ariaLabel="Pick a colour" />
        </div>
      </div>
      <div className="mt-2 grid max-h-28 grid-cols-2 gap-1.5 overflow-y-auto">
        {(catalogItem?.colors ?? []).map((option) => {
          const selected = selectedNames.has(option.colorName.toLocaleLowerCase())
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              className="justify-start gap-2"
              onClick={() => toggle({ id: option.id, name: option.colorName, hex: option.colorHex })}
            >
              <span className="size-3 rounded-full border" style={{ backgroundColor: option.colorHex }} />
              {option.colorName}
              {selected && <Check className="ml-auto size-3" aria-hidden="true" />}
            </Button>
          )
        })}
      </div>
      <Input
        autoFocus
        className="mt-2"
        value={value}
        placeholder="Type colours separated by commas"
        aria-label="Colours"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && suggestions.length) {
            event.preventDefault()
            setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp' && suggestions.length) {
            event.preventDefault()
            setHighlightedIndex((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            if (suggestions[highlightedIndex]) selectOption(suggestions[highlightedIndex])
            else finish()
          } else if (event.key === 'Escape') {
            onFinishedEditing()
          }
        }}
      />
      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Colour suggestions" className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-background p-1">
          {suggestions.map((option, index) => (
            <button
              key={`${option.name}-${option.hex}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted aria-selected:bg-muted"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              <span className="size-3 rounded-full border" style={{ backgroundColor: option.hex }} />
              <span>{option.name}</span>
              {option.id && <span className="ml-auto text-xs text-muted-foreground">Catalog</span>}
            </button>
          ))}
        </div>
      )}
      <Button type="button" className="mt-2 w-full" onClick={finish}>
        Done
      </Button>
    </div>
  )
}
