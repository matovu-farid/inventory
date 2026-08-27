import * as React from 'react'
import { Plus, Trash2, Undo2, Redo2, X } from 'lucide-react'

import { searchItems } from '#/server/functions/items/items'
import { Combobox } from '#/components/ui/combobox'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { deriveSizes } from '#/lib/variants'
import { formatItemArticleNumbers } from '#/lib/items/article-number'
import { roundUgxBankers50 } from '#/lib/format'
import type { ItemSummary } from '#/components/items/item-picker'
import {
  addOpeningBalanceRow,
  calculateOpeningBalanceRowAmount,
  ensureOpeningBalanceRows,
  fillDownOpeningBalanceCells,
  isOpeningBalanceRowEmpty,
  removeOpeningBalanceRow,
  rowForOpeningBalanceItem,
} from './opening-balance-table-state'
import type {
  OpeningBalanceCellLocation,
  OpeningBalanceColumnId,
  OpeningBalanceTableRow,
} from './opening-balance-table-state'

interface OpeningBalanceItemPickerProps {
  row: OpeningBalanceTableRow
  rowNumber: number
  disabled?: boolean
  onChange: (item: ItemSummary) => void
  onFocus: () => void
}

function OpeningBalanceItemPicker({
  row,
  rowNumber,
  disabled,
  onChange,
  onFocus,
}: OpeningBalanceItemPickerProps) {
  const [results, setResults] = React.useState<ItemSummary[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const selectedItems = React.useRef(new Map<string, ItemSummary>())
  const requestId = React.useRef(0)
  const searchTimer = React.useRef<number | null>(null)

  const load = React.useCallback(async (query: string) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const response = await searchItems({
        data: { query, includeArchived: false },
      })
      if (currentRequest !== requestId.current) return
      const next = Array.isArray(response) ? (response as ItemSummary[]) : []
      next.forEach((item) => selectedItems.current.set(item.id, item))
      setResults(next)
    } catch {
      if (currentRequest === requestId.current) {
        setResults([])
        setError('Could not search items. Try again.')
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load('')
    return () => {
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
    }
  }, [load])

  const options = React.useMemo(() => {
    const all = [...results]
    if (row.item && !all.some((item) => item.id === row.item?.id)) {
      all.unshift(row.item)
    }
    return all.map((item) => ({
      value: item.id,
      label: `${formatItemArticleNumbers(item.articleNumbers) || 'No art no.'} — ${item.design} · ${item.name}`,
    }))
  }, [results, row.item])

  return (
    <div onFocus={onFocus}>
      <Combobox
        options={options}
        value={row.itemId ?? undefined}
        onChange={(itemId) => {
          const item = selectedItems.current.get(itemId) ?? row.item
          if (item) onChange(item)
        }}
        onSearchChange={(query) => {
          if (searchTimer.current !== null) {
            window.clearTimeout(searchTimer.current)
          }
          searchTimer.current = window.setTimeout(() => void load(query), 120)
        }}
        placeholder="Select item…"
        searchPlaceholder="Type article number, design, or item name…"
        emptyMessage={loading ? 'Searching…' : (error ?? 'No matching item.')}
        aria-label={`Item row ${rowNumber}`}
        disabled={disabled}
      />
    </div>
  )
}

const colorNone = 'No colour'
const sizeNone = 'No size'

function getVariantId(
  item: ItemSummary | null,
  colorId: string,
  size: string,
): string | null {
  if (!item || !colorId || !size.trim()) return null
  return (
    item.variants?.find(
      (variant) => variant.colorId === colorId && variant.size === size.trim(),
    )?.id ?? null
  )
}

export interface OpeningBalanceTableProps {
  rows: OpeningBalanceTableRow[]
  onRowsChange: (rows: OpeningBalanceTableRow[]) => void
  disabled?: boolean
  validationError?: string | null
  resetToken?: string | number
}

export function OpeningBalanceTable({
  rows,
  onRowsChange,
  disabled = false,
  validationError,
  resetToken,
}: OpeningBalanceTableProps) {
  const currentRows = React.useRef(rows)
  const past = React.useRef<OpeningBalanceTableRow[][]>([])
  const future = React.useRef<OpeningBalanceTableRow[][]>([])
  const lastHistoryKey = React.useRef<string | null>(null)
  const [activeCell, setActiveCell] =
    React.useState<OpeningBalanceCellLocation | null>(null)
  const [fillTarget, setFillTarget] = React.useState<number | null>(null)
  const fillTargetRef = React.useRef<number | null>(null)
  const fillSource = React.useRef<OpeningBalanceCellLocation | null>(null)
  const rowRefs = React.useRef<Record<number, HTMLTableRowElement | null>>({})

  currentRows.current = rows

  React.useEffect(() => {
    past.current = []
    future.current = []
    lastHistoryKey.current = null
    setActiveCell(null)
  }, [resetToken])

  const commitRows = React.useCallback(
    (next: OpeningBalanceTableRow[], historyKey: string | null = null) => {
      if (next === currentRows.current) return
      if (historyKey !== lastHistoryKey.current) {
        past.current = [...past.current.slice(-49), currentRows.current]
      }
      future.current = []
      lastHistoryKey.current = historyKey
      currentRows.current = next
      onRowsChange(next)
    },
    [onRowsChange],
  )

  const updateRow = React.useCallback(
    (index: number, patch: Partial<OpeningBalanceTableRow>) => {
      const next = currentRows.current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      )
      const historyKey = `${index}:${Object.keys(patch).sort().join(',')}`
      commitRows(next, historyKey)
    },
    [commitRows],
  )

  const activateCell = React.useCallback(
    (rowIndex: number, column: OpeningBalanceColumnId) => {
      const row = currentRows.current.at(rowIndex)
      if (
        row &&
        rowIndex === currentRows.current.length - 1 &&
        isOpeningBalanceRowEmpty(row)
      ) {
        commitRows(
          ensureOpeningBalanceRows(
            currentRows.current,
            currentRows.current.length + 1,
          ),
        )
      }
      setActiveCell({ row: rowIndex, column })
    },
    [commitRows],
  )

  const undo = React.useCallback(() => {
    const previous = past.current.at(-1)
    if (!previous) return
    past.current = past.current.slice(0, -1)
    future.current = [currentRows.current, ...future.current]
    lastHistoryKey.current = null
    currentRows.current = previous
    onRowsChange(previous)
  }, [onRowsChange])

  const redo = React.useCallback(() => {
    const next = future.current.at(0)
    if (!next) return
    future.current = future.current.slice(1)
    past.current = [...past.current, currentRows.current]
    lastHistoryKey.current = null
    currentRows.current = next
    onRowsChange(next)
  }, [onRowsChange])

  const getTargetRow = React.useCallback((clientY: number) => {
    const visibleRows = currentRows.current
    for (let index = 0; index < visibleRows.length; index += 1) {
      const element = rowRefs.current[index]
      if (!element) continue
      const rect = element.getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) return index
    }
    const last = rowRefs.current[visibleRows.length - 1]
    if (last && clientY > last.getBoundingClientRect().bottom) {
      return visibleRows.length
    }
    return null
  }, [])

  React.useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!fillSource.current) return
      const target = getTargetRow(event.clientY)
      fillTargetRef.current = target
      setFillTarget(target)
    }

    function handlePointerUp() {
      const source = fillSource.current
      const target = fillTargetRef.current
      fillSource.current = null
      fillTargetRef.current = null
      setFillTarget(null)
      if (!source || target === null || target <= source.row) return
      const targetRows = Array.from(
        { length: target - source.row },
        (_, offset) => source.row + offset + 1,
      )
      commitRows(
        fillDownOpeningBalanceCells(currentRows.current, source, targetRows),
      )
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [commitRows, getTargetRow])

  function startFill(
    event: React.PointerEvent,
    cell: OpeningBalanceCellLocation,
  ) {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    fillSource.current = cell
    setActiveCell(cell)
    fillTargetRef.current = cell.row
    setFillTarget(cell.row)
  }

  function addLine() {
    commitRows(addOpeningBalanceRow(currentRows.current), null)
  }

  function deleteLine(index: number) {
    commitRows(removeOpeningBalanceRow(currentRows.current, index), null)
    setActiveCell(null)
  }

  function rowHasError(index: number) {
    return Boolean(
      validationError?.startsWith(`Opening-balance line ${index + 1}`),
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <Table className="min-w-[1560px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"> </TableHead>
            <TableHead className="w-[220px]">Item</TableHead>
            <TableHead className="w-[150px]">Item name</TableHead>
            <TableHead className="w-[160px]">Design</TableHead>
            <TableHead className="w-[150px]">Art No.</TableHead>
            <TableHead className="w-[150px]">Colour</TableHead>
            <TableHead className="w-[120px]">Size</TableHead>
            <TableHead className="w-[110px]">Qty (pcs)</TableHead>
            <TableHead className="w-[150px]">Unit cost (UGX)</TableHead>
            <TableHead className="w-[170px]">Minimum sell price</TableHead>
            <TableHead className="w-[160px]">Low-stock threshold</TableHead>
            <TableHead className="w-[140px] text-right">Amount (UGX)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => {
            const hasError = rowHasError(index)
            const colorOptions =
              row.item?.colors.map((color) => ({
                value: color.id,
                label: color.colorName,
              })) ?? []
            const sizeOptions = row.item
              ? deriveSizes(row.item.variants ?? []).map((size) => ({
                  value: size,
                  label: size,
                }))
              : []
            const amount = calculateOpeningBalanceRowAmount(row)
            return (
              <TableRow
                key={row.id}
                ref={(element) => {
                  rowRefs.current[index] = element
                }}
                data-opening-balance-row
                className={hasError ? 'bg-destructive/5' : undefined}
                onClick={() => {
                  if (
                    index === rows.length - 1 &&
                    isOpeningBalanceRowEmpty(row)
                  ) {
                    activateCell(index, 'item')
                  }
                }}
              >
                <TableCell>
                  {!isOpeningBalanceRowEmpty(row) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive"
                      onClick={() => deleteLine(index)}
                      disabled={disabled}
                      aria-label={`Delete opening balance line ${index + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'item')}
                >
                  <OpeningBalanceItemPicker
                    row={row}
                    rowNumber={index + 1}
                    disabled={disabled}
                    onFocus={() => activateCell(index, 'item')}
                    onChange={(item) =>
                      updateRow(index, rowForOpeningBalanceItem(row.id, item))
                    }
                  />
                  {activeCell?.row === index &&
                    activeCell.column === 'item' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, { row: index, column: 'item' })
                        }
                      />
                    )}
                </TableCell>
                <TableCell className="text-foreground">
                  {row.item?.name ?? <Placeholder>Item name</Placeholder>}
                </TableCell>
                <TableCell className="text-foreground">
                  {row.item?.design ?? <Placeholder>Design</Placeholder>}
                </TableCell>
                <TableCell className="text-foreground">
                  {row.item ? (
                    formatItemArticleNumbers(row.item.articleNumbers) || (
                      <Placeholder>No art no.</Placeholder>
                    )
                  ) : (
                    <Placeholder>Art No.</Placeholder>
                  )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'color')}
                >
                  <div className="flex items-center gap-1">
                    <Combobox
                      options={colorOptions}
                      value={row.colorId || undefined}
                      onChange={(colorId) =>
                        updateRow(index, {
                          colorId,
                          variantId: getVariantId(row.item, colorId, row.size),
                        })
                      }
                      placeholder={colorNone}
                      searchPlaceholder="Search colour…"
                      aria-label={`Colour row ${index + 1}`}
                      aria-invalid={hasError || undefined}
                      disabled={disabled || !row.item}
                      triggerClassName="min-w-0"
                    />
                    {row.colorId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Clear colour row ${index + 1}`}
                        onClick={() =>
                          updateRow(index, { colorId: '', variantId: null })
                        }
                        disabled={disabled}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  {activeCell?.row === index &&
                    activeCell.column === 'color' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, { row: index, column: 'color' })
                        }
                      />
                    )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'size')}
                >
                  <div className="flex items-center gap-1">
                    <Combobox
                      options={sizeOptions}
                      value={row.size || undefined}
                      onChange={(size) =>
                        updateRow(index, {
                          size,
                          variantId: getVariantId(row.item, row.colorId, size),
                        })
                      }
                      placeholder={sizeNone}
                      searchPlaceholder="Search size…"
                      aria-label={`Size row ${index + 1}`}
                      aria-invalid={hasError || undefined}
                      disabled={disabled || !row.item}
                      triggerClassName="min-w-0"
                    />
                    {row.size && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Clear size row ${index + 1}`}
                        onClick={() =>
                          updateRow(index, { size: '', variantId: null })
                        }
                        disabled={disabled}
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  {activeCell?.row === index &&
                    activeCell.column === 'size' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, { row: index, column: 'size' })
                        }
                      />
                    )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'quantity')}
                >
                  <Input
                    aria-label={`Quantity row ${index + 1}`}
                    onFocus={() => activateCell(index, 'quantity')}
                    type="number"
                    min={1}
                    step={1}
                    value={row.quantity ?? ''}
                    onChange={(event) =>
                      updateRow(index, {
                        quantity:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                    disabled={disabled}
                    aria-invalid={hasError || undefined}
                  />
                  {activeCell?.row === index &&
                    activeCell.column === 'quantity' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, { row: index, column: 'quantity' })
                        }
                      />
                    )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'unitCostUgx')}
                >
                  <MoneyInput
                    aria-label={`Unit cost row ${index + 1}`}
                    onFocus={() => activateCell(index, 'unitCostUgx')}
                    currency="UGX"
                    decimals={0}
                    roundTo={50}
                    value={row.unitCostUgx}
                    onChange={(unitCostUgx) =>
                      updateRow(index, { unitCostUgx })
                    }
                    placeholder="0"
                    disabled={disabled}
                    aria-invalid={hasError || undefined}
                  />
                  {activeCell?.row === index &&
                    activeCell.column === 'unitCostUgx' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, {
                            row: index,
                            column: 'unitCostUgx',
                          })
                        }
                      />
                    )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'minimumSellPriceUgx')}
                >
                  <MoneyInput
                    aria-label={`Minimum sell price row ${index + 1}`}
                    onFocus={() => activateCell(index, 'minimumSellPriceUgx')}
                    currency="UGX"
                    decimals={0}
                    roundTo={50}
                    value={row.minimumSellPriceUgx}
                    onChange={(minimumSellPriceUgx) =>
                      updateRow(index, { minimumSellPriceUgx })
                    }
                    placeholder="0"
                    disabled={disabled}
                    aria-invalid={hasError || undefined}
                  />
                  {activeCell?.row === index &&
                    activeCell.column === 'minimumSellPriceUgx' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, {
                            row: index,
                            column: 'minimumSellPriceUgx',
                          })
                        }
                      />
                    )}
                </TableCell>
                <TableCell
                  className="relative"
                  onClick={() => activateCell(index, 'lowStockThreshold')}
                >
                  <Input
                    aria-label={`Low-stock threshold row ${index + 1}`}
                    onFocus={() => activateCell(index, 'lowStockThreshold')}
                    type="number"
                    min={0}
                    step={1}
                    value={row.lowStockThreshold}
                    onChange={(event) =>
                      updateRow(index, {
                        lowStockThreshold:
                          event.target.value === ''
                            ? 0
                            : Number(event.target.value),
                      })
                    }
                    disabled={disabled}
                    aria-invalid={hasError || undefined}
                  />
                  {activeCell?.row === index &&
                    activeCell.column === 'lowStockThreshold' && (
                      <FillHandle
                        disabled={disabled}
                        onPointerDown={(event) =>
                          startFill(event, {
                            row: index,
                            column: 'lowStockThreshold',
                          })
                        }
                      />
                    )}
                </TableCell>
                <TableCell className="text-right font-mono text-foreground">
                  {amount ? roundUgxBankers50(amount).toFormat(0) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {fillTarget !== null &&
        fillSource.current &&
        fillTarget > fillSource.current.row && (
          <div className="border-t bg-primary/5 px-3 py-1 text-xs text-muted-foreground">
            Copying {fillSource.current.column} through row {fillTarget + 1}
          </div>
        )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addLine}
          disabled={disabled}
          aria-label="Add opening balance line"
        >
          <Plus /> Add opening balance line
        </Button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={disabled || past.current.length === 0}
            aria-label="Undo opening balance edit"
          >
            <Undo2 /> Undo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={disabled || future.current.length === 0}
            aria-label="Redo opening balance edit"
          >
            <Redo2 /> Redo
          </Button>
        </div>
      </div>
    </div>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

function FillHandle({
  disabled,
  onPointerDown,
}: {
  disabled: boolean
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className="absolute bottom-0 right-0 z-10 size-3 translate-x-1/2 translate-y-1/2 rounded-full border-2 border-background bg-primary"
      aria-label="Drag to copy this cell down"
      disabled={disabled}
      onPointerDown={onPointerDown}
    />
  )
}
