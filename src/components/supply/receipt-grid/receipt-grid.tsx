import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { searchItems } from '#/server/functions/items/items'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandList,
} from '#/components/ui/command'
import { Input } from '#/components/ui/input'
import { MoneyInput } from '#/components/ui/money-input'
import { HexColorField } from '#/components/items/hex-color-field'
import { Popover, PopoverAnchor, PopoverContent } from '#/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { matchPaletteHex } from '#/lib/colors/match-palette'
import { roundUgxBankers50 } from '#/lib/format'
import {
  colorNameToHex,
  getActiveColorIndex,
  getActiveColorQuery,
  normalizeColorHex,
  paletteReceiptColorOptions,
  splitColorSegments,
} from '#/lib/colors/receipt-colors'
import {
  addReceiptRow,
  applyPasteMatrix,
  calculateRowAmount,
  copyReceiptRow,
  createEmptyReceiptRow,
  ensureReceiptRows,
  fillDownReceiptCells,
  isReceiptRowEmpty,
  removeReceiptRow,
  updateReceiptCell,
} from './receipt-grid-state'
import { calculateItemEntryGridTotals } from '#/components/item-entry-grid/item-entry-grid-state'
import type {
  ItemEntryGridConfig,
  ReceiptGridCatalogItem,
  ReceiptGridColumnId,
  ReceiptGridRow,
} from './types'

const receiptColumns: ReadonlyArray<{
  id: ReceiptGridColumnId | 'remove' | 'amount'
  title: string
  width: string
}> = [
  { id: 'remove', title: '', width: '42px' },
  { id: 'itemName', title: 'Item name', width: '160px' },
  { id: 'design', title: 'Design', width: '210px' },
  { id: 'articleNumber', title: 'Art No.', width: '140px' },
  { id: 'colorText', title: 'Colour', width: '170px' },
  { id: 'sizeText', title: 'Size', width: '145px' },
  { id: 'quantity', title: 'Qty (pcs)', width: '105px' },
  { id: 'unitPriceForeign', title: 'Unit Price', width: '125px' },
  {
    id: 'minimumSellPriceUgx',
    title: 'Min sell price (UGX)',
    width: '155px',
  },
  { id: 'lowStockThreshold', title: 'Low-stock threshold', width: '175px' },
  { id: 'amount', title: 'Amount', width: '135px' },
]

type ReceiptColumnId = (typeof receiptColumns)[number]['id']

function stickyColumnClass(column: ReceiptColumnId): string {
  if (column === 'minimumSellPriceUgx')
    return 'sticky right-[175px] z-10 bg-background shadow-[-4px_0_8px_-8px_rgba(0,0,0,0.35)]'
  if (column === 'lowStockThreshold')
    return 'sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-8px_rgba(0,0,0,0.35)]'
  return ''
}

function stickyHeaderClass(column: ReceiptColumnId): string {
  const sticky = stickyColumnClass(column)
  return sticky ? sticky.replace('bg-background', 'bg-muted/60') : ''
}

function columnsFor(config: ItemEntryGridConfig) {
  return receiptColumns.map((column) =>
    column.id === 'unitPriceForeign'
      ? { ...column, title: config.costLabel }
      : column.id === 'amount'
        ? { ...column, title: config.amountLabel }
        : column,
  )
}

type EditableColumn = ReceiptGridColumnId

export type ReceiptGridHistoryControls = {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export const RECEIPT_GRID_CONFIG: ItemEntryGridConfig = {
  mode: 'receipt',
  costLabel: 'Unit Price',
  amountLabel: 'Amount',
  totalLabel: 'Total amount',
  currency: 'foreign',
}

type LocalHistory = { past: ReceiptGridRow[][]; future: ReceiptGridRow[][] }
type CellLocation = { row: number; column: EditableColumn }
type FillDrag = { source: CellLocation; targetRow: number }

function cloneRows(rows: ReceiptGridRow[]): ReceiptGridRow[] {
  return rows.map((row) => copyReceiptRow(row, row.id))
}

function rowsEqual(left: ReceiptGridRow[], right: ReceiptGridRow[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function isReceiptGridOutsideClick(event: MouseEvent | TouchEvent) {
  const target = event.target
  return !(
    target instanceof Element && target.closest('[data-slot="popover-content"]')
  )
}

function range(start: number, end: number): number[] {
  return Array.from(
    { length: Math.max(0, end - start + 1) },
    (_, index) => start + index,
  )
}

export function ReceiptGrid({
  rows,
  supplierId,
  disabled = false,
  onRowsChange,
  historyControls,
  config = RECEIPT_GRID_CONFIG,
}: {
  rows: ReceiptGridRow[]
  supplierId?: string
  disabled?: boolean
  onRowsChange: (rows: ReceiptGridRow[]) => void
  historyControls?: ReceiptGridHistoryControls
  config?: ItemEntryGridConfig
}) {
  const [activeCell, setActiveCell] = useState<CellLocation | null>(null)
  const [fillDrag, setFillDrag] = useState<FillDrag | null>(null)
  const currentRowsRef = useRef(rows)
  const localHistoryRef = useRef<LocalHistory>({ past: [], future: [] })
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({})
  const fillTargetRef = useRef(0)
  const [, setHistoryVersion] = useState(0)
  const totals = useMemo(() => calculateItemEntryGridTotals(rows), [rows])
  const columns = useMemo(() => columnsFor(config), [config])
  const effectiveSupplierId = config.supplierId ?? supplierId
  currentRowsRef.current = rows

  const commitRows = useCallback(
    (nextRows: ReceiptGridRow[]) => {
      const currentRows = currentRowsRef.current
      if (rowsEqual(currentRows, nextRows)) return
      if (!historyControls) {
        localHistoryRef.current = {
          past: [...localHistoryRef.current.past, cloneRows(currentRows)],
          future: [],
        }
        setHistoryVersion((version) => version + 1)
      }
      currentRowsRef.current = nextRows
      onRowsChange(nextRows)
    },
    [historyControls, onRowsChange],
  )

  const undo = useCallback(() => {
    if (disabled) return
    if (historyControls) {
      historyControls.onUndo()
      return
    }
    const previous = localHistoryRef.current.past.at(-1)
    if (!previous) return
    localHistoryRef.current = {
      past: localHistoryRef.current.past.slice(0, -1),
      future: [
        ...localHistoryRef.current.future,
        cloneRows(currentRowsRef.current),
      ],
    }
    currentRowsRef.current = previous
    setHistoryVersion((version) => version + 1)
    onRowsChange(previous)
  }, [disabled, historyControls, onRowsChange])

  const redo = useCallback(() => {
    if (disabled) return
    if (historyControls) {
      historyControls.onRedo()
      return
    }
    const nextRows = localHistoryRef.current.future.at(-1)
    if (!nextRows) return
    localHistoryRef.current = {
      past: [
        ...localHistoryRef.current.past,
        cloneRows(currentRowsRef.current),
      ],
      future: localHistoryRef.current.future.slice(0, -1),
    }
    currentRowsRef.current = nextRows
    setHistoryVersion((version) => version + 1)
    onRowsChange(nextRows)
  }, [disabled, historyControls, onRowsChange])

  const handleShortcut = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key.toLocaleLowerCase()
      const isUndo =
        key === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey
      const isRedo =
        (key === 'z' && (event.metaKey || event.ctrlKey) && event.shiftKey) ||
        (key === 'y' && event.ctrlKey && !event.metaKey)
      if (!isUndo && !isRedo) return
      const target = event.target
      if (
        target instanceof HTMLInputElement &&
        target.dataset.receiptDirty === 'true'
      )
        return
      event.preventDefault()
      if (isUndo) undo()
      else redo()
    },
    [redo, undo],
  )

  const appendBlankAfter = useCallback(
    (rowIndex: number) => {
      const currentRows = currentRowsRef.current
      if (
        rowIndex !== currentRows.length - 1 ||
        !isReceiptRowEmpty(currentRows[rowIndex])
      )
        return
      commitRows([...currentRows, createEmptyReceiptRow(crypto.randomUUID())])
    },
    [commitRows],
  )

  const activateCell = useCallback(
    (row: number, column: EditableColumn) => {
      appendBlankAfter(row)
      setActiveCell({ row, column })
    },
    [appendBlankAfter],
  )

  const updateCell = useCallback(
    (rowIndex: number, column: EditableColumn, value: string) => {
      commitRows(
        updateReceiptCell(
          ensureReceiptRows(currentRowsRef.current, rowIndex + 1),
          rowIndex,
          column,
          value,
        ),
      )
    },
    [commitRows],
  )

  const updateDesign = useCallback(
    (rowIndex: number, value: string, catalogItem?: ReceiptGridCatalogItem) => {
      const editableRows = ensureReceiptRows(
        currentRowsRef.current,
        rowIndex + 1,
      )
      const nextRows = updateReceiptCell(
        editableRows,
        rowIndex,
        'design',
        value,
      ).map((row, index) => {
        if (index !== rowIndex) return row
        if (catalogItem) {
          const catalogColors = catalogItem.colors
          const catalogSizes = Array.from(
            new Set(
              (catalogItem.variants ?? []).map((variant) => variant.size),
            ),
          )
          const hasSingleVariant =
            catalogColors.length === 1 && catalogSizes.length === 1
          return {
            ...row,
            itemName: catalogItem.name,
            itemId: catalogItem.id,
            catalogItem,
            colorText:
              row.colorText.trim() ||
              catalogColors.map((color) => color.colorName).join(', '),
            colorHexText:
              row.colorHexText.trim() ||
              catalogColors.map((color) => color.colorHex).join(', '),
            colorIds:
              row.colorIds.length > 0
                ? row.colorIds
                : hasSingleVariant
                  ? [catalogColors[0].id]
                  : [],
            sizeText: row.sizeText.trim() || catalogSizes.join(', '),
            minimumSellPriceUgx: catalogItem.minimumSellPriceUgx,
            lowStockThreshold: catalogItem.lowStockThreshold,
            articleNumber:
              catalogItem.articleNumbers.length === 1
                ? catalogItem.articleNumbers[0].articleNumber
                : row.articleNumber,
          }
        }
        return {
          ...row,
          itemId: null,
          catalogItem: null,
          colorIds: [],
          minimumSellPriceUgx: '',
          lowStockThreshold: 0,
        }
      })
      commitRows(nextRows)
    },
    [commitRows],
  )

  const updateColor = useCallback(
    (
      rowIndex: number,
      value: { text: string; hexText: string; ids: string[] },
    ) => {
      const editableRows = ensureReceiptRows(
        currentRowsRef.current,
        rowIndex + 1,
      )
      commitRows(
        editableRows.map((row, index) =>
          index === rowIndex
            ? {
                ...row,
                colorText: value.text,
                colorHexText: value.hexText,
                colorIds: value.ids,
              }
            : row,
        ),
      )
    },
    [commitRows],
  )

  const getRowAtY = useCallback((clientY: number) => {
    const currentRows = currentRowsRef.current
    for (let index = 0; index < currentRows.length; index += 1) {
      const element = rowRefs.current[index]
      if (!element) continue
      if (clientY < element.getBoundingClientRect().bottom) return index
    }
    const lastRow = rowRefs.current[currentRows.length - 1]
    if (!lastRow) return currentRows.length - 1
    const rect = lastRow.getBoundingClientRect()
    return (
      currentRows.length +
      Math.floor(Math.max(0, clientY - rect.bottom) / Math.max(1, rect.height))
    )
  }, [])

  useEffect(() => {
    if (!fillDrag) return
    const handleMove = (event: PointerEvent) => {
      const targetRow = getRowAtY(event.clientY)
      fillTargetRef.current = targetRow
      setFillDrag((current) => (current ? { ...current, targetRow } : current))
    }
    const handleUp = () => {
      const targetRow = fillTargetRef.current
      const source = fillDrag.source
      if (targetRow > source.row) {
        const filled = fillDownReceiptCells(
          currentRowsRef.current,
          source,
          range(source.row + 1, targetRow),
        )
        commitRows(
          ensureReceiptRows(
            filled,
            targetRow >= currentRowsRef.current.length - 1
              ? targetRow + 2
              : filled.length,
          ),
        )
        setActiveCell(source)
      }
      setFillDrag(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [commitRows, fillDrag, getRowAtY])

  function beginFill(event: React.PointerEvent, source: CellLocation) {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    fillTargetRef.current = source.row
    setFillDrag({ source, targetRow: source.row })
  }

  function handlePaste(
    event: React.ClipboardEvent<HTMLInputElement>,
    row: number,
    column: EditableColumn,
  ) {
    const text = event.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    event.preventDefault()
    const matrix = text
      .trimEnd()
      .split(/\r?\n/)
      .map((line) => line.split('\t'))
    commitRows(
      applyPasteMatrix(
        ensureReceiptRows(currentRowsRef.current, row + matrix.length),
        { row, column },
        matrix,
      ),
    )
  }

  function handleDelete(rowIndex: number) {
    if (disabled || isReceiptRowEmpty(currentRowsRef.current[rowIndex])) return
    commitRows(removeReceiptRow(currentRowsRef.current, rowIndex))
    setActiveCell(null)
  }

  function handleAddRow() {
    if (!disabled) commitRows(addReceiptRow(currentRowsRef.current))
  }

  const canUndo =
    historyControls?.canUndo ?? localHistoryRef.current.past.length > 0
  const canRedo =
    historyControls?.canRedo ?? localHistoryRef.current.future.length > 0

  return (
    <div
      data-testid="receipt-grid"
      data-item-entry-grid="true"
      className="min-w-[1000px] overflow-hidden rounded-md border bg-background text-foreground"
      onKeyDownCapture={handleShortcut}
    >
      <div className="overflow-x-auto">
        <Table className="min-w-[1562px] table-fixed">
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={{ width: column.width }} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={`h-11 border-r px-3 text-foreground last:border-r-0 ${stickyHeaderClass(column.id)}`}
                >
                  {column.title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                ref={(element) => {
                  rowRefs.current[rowIndex] = element
                }}
                data-receipt-row={rowIndex}
                data-opening-balance-row={
                  config.mode === 'opening-balance' ? true : undefined
                }
                className="group hover:bg-muted/20"
              >
                <TableCell className="border-r p-0 text-center">
                  {!isReceiptRowEmpty(row) && !disabled && (
                    <button
                      type="button"
                      aria-label={`Delete ${config.mode === 'opening-balance' ? 'opening balance' : 'receipt'} line ${rowIndex + 1}`}
                      title="Delete receipt line"
                      className="inline-flex size-7 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      onClick={() => handleDelete(rowIndex)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                  <span className="sr-only">Row {rowIndex + 1}</span>
                </TableCell>
                {(
                  [
                    'itemName',
                    'design',
                    'articleNumber',
                    'colorText',
                    'sizeText',
                    'quantity',
                    'unitPriceForeign',
                    'minimumSellPriceUgx',
                    'lowStockThreshold',
                  ] as EditableColumn[]
                ).map((column) => (
                  <EditableTableCell
                    key={column}
                    row={row}
                    rowIndex={rowIndex}
                    column={column}
                    active={
                      activeCell?.row === rowIndex &&
                      activeCell.column === column
                    }
                    disabled={disabled}
                    onActivate={activateCell}
                    onCommit={
                      column === 'design'
                        ? (value) => updateDesign(rowIndex, value as string)
                        : column === 'colorText'
                          ? (value) =>
                              updateColor(
                                rowIndex,
                                value as {
                                  text: string
                                  hexText: string
                                  ids: string[]
                                },
                              )
                          : (value) =>
                              updateCell(rowIndex, column, value as string)
                    }
                    onCatalogItemSelected={
                      column === 'design'
                        ? (item) =>
                            updateDesign(
                              rowIndex,
                              item.design || item.name,
                              item,
                            )
                        : undefined
                    }
                    onPaste={handlePaste}
                    onFillStart={beginFill}
                    fillDrag={fillDrag}
                    supplierId={effectiveSupplierId}
                    costLabel={config.costLabel}
                    mode={config.mode}
                    rowNumber={rowIndex + 1}
                    currency={config.currency}
                  />
                ))}
                <TableCell className="border-r p-0 last:border-r-0">
                  <div className="flex min-h-11 items-center justify-end px-3 font-medium text-foreground">
                    {config.currency === 'UGX' && calculateRowAmount(row)
                      ? roundUgxBankers50(calculateRowAmount(row)).toFormat(0)
                      : calculateRowAmount(row)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!disabled && (
        <button
          type="button"
          className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onClick={handleAddRow}
        >
          <Plus className="size-4" aria-hidden="true" />
          {config.mode === 'opening-balance'
            ? 'Add opening balance line'
            : 'Add receipt line'}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Undo"
            title="Undo (⌘/Ctrl+Z)"
            className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled || !canUndo}
            onClick={undo}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (⌘/Ctrl+Shift+Z or Ctrl+Y)"
            className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled || !canRedo}
            onClick={redo}
          >
            <Redo2 className="size-4" aria-hidden="true" />
            Redo
          </button>
          <span className="ml-1 hidden text-xs text-muted-foreground sm:inline">
            ⌘/Ctrl+Z · ⌘/Ctrl+Shift+Z
          </span>
        </div>
        <div className="flex items-center gap-6">
          <span>
            Total pieces:{' '}
            <strong className="text-foreground">{totals.totalPieces}</strong>
          </span>
          <span>
            {config.totalLabel}:{' '}
            <strong className="text-foreground">{totals.totalAmount}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}

function EditableTableCell({
  row,
  rowIndex,
  column,
  active,
  disabled,
  onActivate,
  onCommit,
  onCatalogItemSelected,
  onPaste,
  onFillStart,
  fillDrag,
  supplierId,
  costLabel,
  mode,
  rowNumber,
  currency,
}: {
  row: ReceiptGridRow
  rowIndex: number
  column: EditableColumn
  active: boolean
  disabled: boolean
  onActivate: (row: number, column: EditableColumn) => void
  onCommit: (
    value: string | { text: string; hexText: string; ids: string[] },
  ) => void
  onCatalogItemSelected?: (item: ReceiptGridCatalogItem) => void
  onPaste: (
    event: React.ClipboardEvent<HTMLInputElement>,
    row: number,
    column: EditableColumn,
  ) => void
  onFillStart: (event: React.PointerEvent, source: CellLocation) => void
  fillDrag: FillDrag | null
  supplierId?: string
  costLabel: string
  mode: ItemEntryGridConfig['mode']
  rowNumber: number
  currency: ItemEntryGridConfig['currency']
}) {
  const value =
    column === 'quantity'
      ? row.quantity === null
        ? ''
        : String(row.quantity)
      : column === 'lowStockThreshold'
        ? String(row.lowStockThreshold)
        : row[column]
  const isFillPreview =
    fillDrag &&
    fillDrag.source.column === column &&
    rowIndex > fillDrag.source.row &&
    rowIndex <= fillDrag.targetRow
  const className = `relative border-r p-0 last:border-r-0 ${stickyColumnClass(column)} ${active ? '!bg-blue-50/80 dark:!bg-blue-950/30' : ''} ${isFillPreview ? '!bg-blue-100/70 dark:!bg-blue-900/30' : ''}`
  return (
    <TableCell className={className}>
      {column === 'design' ? (
        <DesignEditor
          value={value}
          disabled={disabled}
          active={active}
          onActivate={() => onActivate(rowIndex, column)}
          onCommit={(next) => onCommit(next)}
          onCatalogItemSelected={onCatalogItemSelected}
          onPaste={(event) => onPaste(event, rowIndex, column)}
          supplierId={supplierId}
          mode={mode}
          rowNumber={rowNumber}
        />
      ) : column === 'colorText' ? (
        <ColorEditor
          row={row}
          disabled={disabled}
          active={active}
          onActivate={() => onActivate(rowIndex, column)}
          onCommit={(next) => onCommit(next)}
          onPaste={(event) => onPaste(event, rowIndex, column)}
          rowNumber={rowNumber}
          mode={mode}
        />
      ) : column === 'sizeText' ? (
        <SizeEditor
          row={row}
          value={value}
          disabled={disabled}
          active={active}
          mode={mode}
          rowNumber={rowNumber}
          onActivate={() => onActivate(rowIndex, column)}
          onCommit={(next) => onCommit(next)}
          onPaste={(event) => onPaste(event, rowIndex, column)}
        />
      ) : (
        <PlainCellInput
          value={value}
          column={column}
          disabled={disabled}
          active={active}
          onActivate={() => onActivate(rowIndex, column)}
          onCommit={(next) => onCommit(next)}
          onPaste={(event) => onPaste(event, rowIndex, column)}
          costLabel={costLabel}
          currency={currency}
          rowNumber={rowNumber}
          mode={mode}
        />
      )}
      {active && !disabled && (
        <button
          type="button"
          aria-label={`Copy ${column} down`}
          title="Drag down to copy"
          className="absolute -bottom-1 -right-1 z-20 size-2.5 cursor-crosshair rounded-sm border border-background bg-primary shadow-sm"
          onPointerDown={(event) =>
            onFillStart(event, { row: rowIndex, column })
          }
        />
      )}
    </TableCell>
  )
}

function SizeEditor({
  row,
  value,
  disabled,
  active,
  mode,
  rowNumber,
  onActivate,
  onCommit,
  onPaste,
}: {
  row: ReceiptGridRow
  value: string
  disabled: boolean
  active: boolean
  mode: ItemEntryGridConfig['mode']
  rowNumber: number
  onActivate: () => void
  onCommit: (value: string) => void
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
}) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  useEffect(() => setDraft(value), [value])
  const options = Array.from(
    new Set((row.catalogItem?.variants ?? []).map((variant) => variant.size)),
  )
  function finish(next = draft) {
    const trimmed = next.trim()
    setDraft(trimmed)
    if (trimmed !== value) onCommit(trimmed)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>
          <Input
            data-receipt-cell-input="true"
            data-receipt-dirty={draft !== value ? 'true' : 'false'}
            role="combobox"
            aria-label={`${mode === 'opening-balance' ? 'Size' : 'Size'}${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`}
            value={draft}
            disabled={disabled}
            placeholder="S, M, L"
            className={`h-11 w-full rounded-none border-0 bg-transparent px-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'ring-2 ring-inset ring-ring' : ''}`}
            onFocus={() => {
              onActivate()
              setOpen(true)
            }}
            onClick={() => {
              onActivate()
              setOpen(true)
            }}
            onChange={(event) => {
              setDraft(event.target.value)
              setOpen(true)
            }}
            onPaste={onPaste}
            onBlur={() => window.setTimeout(() => finish(), 0)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                finish()
              }
              if (event.key === 'Escape') {
                setDraft(value)
                setOpen(false)
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-56 p-2"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="px-1 pb-1 text-xs text-muted-foreground">
          Type comma-separated sizes or choose one
        </p>
        <div className="flex flex-wrap gap-1">
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant="outline"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => finish(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PlainCellInput({
  value,
  column,
  disabled,
  active,
  onActivate,
  onCommit,
  onPaste,
  costLabel,
  currency,
  rowNumber,
  mode,
}: {
  value: string
  column: EditableColumn
  disabled: boolean
  active: boolean
  onActivate: () => void
  onCommit: (value: string) => void
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  costLabel: string
  currency: ItemEntryGridConfig['currency']
  rowNumber: number
  mode: ItemEntryGridConfig['mode']
}) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  useEffect(() => {
    draftRef.current = value
    setDraft(value)
  }, [value])
  function finish() {
    if (draftRef.current !== value) onCommit(draftRef.current)
  }
  if (column === 'minimumSellPriceUgx' || column === 'unitPriceForeign') {
    return (
      <MoneyInput
        data-receipt-cell-input="true"
        data-receipt-dirty={draft !== value ? 'true' : 'false'}
        aria-label={
          column === 'minimumSellPriceUgx'
            ? mode === 'opening-balance'
              ? `Minimum sell price row ${rowNumber}`
              : 'Minimum sell price (UGX)'
            : mode === 'opening-balance'
              ? `Unit cost row ${rowNumber}`
              : costLabel
        }
        currency={currency === 'UGX' ? 'UGX' : undefined}
        value={draft}
        onChange={(next) => {
          draftRef.current = next
          setDraft(next)
          onCommit(next)
        }}
        onFocus={onActivate}
        onPaste={onPaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            setDraft(value)
            event.currentTarget.blur()
          }
        }}
        onBlur={finish}
        disabled={disabled}
        className={`h-11 rounded-none border-0 shadow-none ${active ? 'ring-2 ring-inset ring-ring' : ''}`}
        decimals={0}
        roundTo={column === 'minimumSellPriceUgx' ? 50 : undefined}
      />
    )
  }
  return (
    <Input
      data-receipt-cell-input="true"
      data-receipt-dirty={draft !== value ? 'true' : 'false'}
      role={
        mode === 'opening-balance' && column === 'sizeText'
          ? 'combobox'
          : undefined
      }
      aria-label={
        column === 'itemName'
          ? `Item name${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`
          : column === 'articleNumber'
            ? `Art No.${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`
            : column === 'sizeText'
              ? `Size${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`
              : column === 'quantity'
                ? `${mode === 'opening-balance' ? 'Quantity' : 'Qty (pcs)'}${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`
                : column === 'lowStockThreshold'
                  ? `Low-stock threshold${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`
                  : `${costLabel}${mode === 'opening-balance' ? ` row ${rowNumber}` : ''}`
      }
      type={
        column === 'quantity' || column === 'lowStockThreshold'
          ? 'number'
          : 'text'
      }
      inputMode={column === 'lowStockThreshold' ? 'numeric' : undefined}
      min={
        column === 'quantity' || column === 'lowStockThreshold' ? 0 : undefined
      }
      step={
        column === 'quantity' || column === 'lowStockThreshold' ? 1 : undefined
      }
      value={draft}
      disabled={disabled}
      placeholder={
        column === 'sizeText'
          ? 'S, M, L'
          : column === 'lowStockThreshold'
            ? '0'
            : undefined
      }
      className={`h-11 w-full rounded-none border-0 bg-transparent px-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'ring-2 ring-inset ring-ring' : ''}`}
      onFocus={onActivate}
      onChange={(event) => {
        draftRef.current = event.target.value
        setDraft(event.target.value)
        onCommit(event.target.value)
      }}
      onPaste={onPaste}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function DesignEditor({
  value,
  supplierId,
  disabled,
  active,
  onActivate,
  onCommit,
  onCatalogItemSelected,
  onPaste,
  mode,
  rowNumber,
}: {
  value: string
  supplierId?: string
  disabled: boolean
  active: boolean
  onActivate: () => void
  onCommit: (value: string) => void
  onCatalogItemSelected?: (item: ReceiptGridCatalogItem) => void
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  mode: ItemEntryGridConfig['mode']
  rowNumber: number
}) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ReceiptGridCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const sequence = useRef(0)
  const selectedCatalogItem = useRef(false)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    const request = ++sequence.current
    if (!open || !draft.trim()) {
      setResults([])
      setHasSearched(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = window.setTimeout(() => {
      void searchItems({
        data: { query: draft.trim(), supplierId: supplierId || undefined },
      })
        .then((items) => {
          if (request === sequence.current) {
            setResults(items)
            setHasSearched(true)
          }
        })
        .catch(() => {
          if (request === sequence.current) {
            setResults([])
            setHasSearched(true)
          }
        })
        .finally(() => {
          if (request === sequence.current) setLoading(false)
        })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [draft, open, supplierId])
  function finish(nextValue = draft) {
    const next = nextValue.trim()
    setDraft(next)
    onCommit(next)
    setOpen(false)
  }
  function selectCatalogItem(item: ReceiptGridCatalogItem) {
    const next = item.design || item.name
    selectedCatalogItem.current = true
    setDraft(next)
    onCatalogItemSelected?.(item)
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>
          <Input
            data-receipt-cell-input="true"
            data-receipt-dirty={draft !== value ? 'true' : 'false'}
            role={mode === 'opening-balance' ? 'combobox' : undefined}
            aria-label={
              mode === 'opening-balance' ? `Item row ${rowNumber}` : 'Design'
            }
            value={draft}
            disabled={disabled}
            placeholder={
              mode === 'opening-balance' && active
                ? 'Type article number, design, or item name…'
                : 'Design'
            }
            className={`h-11 w-full rounded-none border-0 bg-transparent px-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'ring-2 ring-inset ring-ring' : ''}`}
            onFocus={() => {
              onActivate()
              setOpen(true)
            }}
            onClick={() => {
              onActivate()
              setOpen(true)
            }}
            onChange={(event) => {
              setDraft(event.target.value)
              setOpen(true)
            }}
            onPaste={onPaste}
            onBlur={() => {
              window.setTimeout(() => {
                if (selectedCatalogItem.current) {
                  selectedCatalogItem.current = false
                  return
                }
                if (
                  document.activeElement?.getAttribute('data-design-option') !==
                  'true'
                )
                  finish()
              }, 0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (results[0]) {
                  selectCatalogItem(results[0])
                } else finish()
              }
              if (event.key === 'Escape') {
                setDraft(value)
                setOpen(false)
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command>
          <CommandList>
            {loading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Searching…
              </p>
            )}
            {!loading &&
              hasSearched &&
              draft.trim() &&
              results.length === 0 && (
                <button
                  type="button"
                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  value={`free-text-${draft}`}
                  onClick={() => finish()}
                >
                  Use “{draft.trim()}” as a new design
                </button>
              )}
            <CommandEmpty>
              {draft.trim()
                ? 'No matching catalog items.'
                : 'Type a design or art number.'}
            </CommandEmpty>
            <CommandGroup>
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  data-design-option="true"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectCatalogItem(item)
                  }}
                  onClick={() => selectCatalogItem(item)}
                >
                  <Check className="mr-2 size-4 opacity-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {item.design || item.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.articleNumbers
                        .map((number) => number.articleNumber)
                        .join(', ')}
                    </span>
                  </span>
                </button>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ColorEditor({
  row,
  disabled,
  active,
  onActivate,
  onCommit,
  onPaste,
  rowNumber,
  mode,
}: {
  row: ReceiptGridRow
  disabled: boolean
  active: boolean
  onActivate: () => void
  onCommit: (value: { text: string; hexText: string; ids: string[] }) => void
  onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => void
  rowNumber: number
  mode: ItemEntryGridConfig['mode']
}) {
  const [value, setValue] = useState(row.colorText)
  const [hexValues, setHexValues] = useState(() =>
    row.colorHexText
      ? row.colorHexText.split(',').map((hex) => hex.trim())
      : [],
  )
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setValue(row.colorText)
    setHexValues(
      row.colorHexText
        ? row.colorHexText.split(',').map((hex) => hex.trim())
        : [],
    )
  }, [row.colorText, row.colorHexText])
  const options = useMemo(() => {
    const seen = new Set<string>()
    return [
      ...(row.catalogItem?.colors ?? []).map((color) => ({
        id: color.id,
        name: color.colorName,
        hex: color.colorHex,
      })),
      ...paletteReceiptColorOptions(),
    ].filter((option) => {
      const key = option.name.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [row.catalogItem])
  const query = getActiveColorQuery(value).toLocaleLowerCase()
  const suggestions = options
    .filter(
      (option) => query && option.name.toLocaleLowerCase().includes(query),
    )
    .slice(0, 8)
  const selectedNames = new Set(
    splitColorSegments(value)
      .map((name) => name.toLocaleLowerCase())
      .filter(Boolean),
  )
  function commit(nextValue = value, nextHexValues = hexValues) {
    const names = splitColorSegments(nextValue)
    const ids = (row.catalogItem?.colors ?? [])
      .filter((color) =>
        names.some(
          (name) =>
            name.toLocaleLowerCase() === color.colorName.toLocaleLowerCase(),
        ),
      )
      .map((color) => color.id)
    const resolvedHexes = names.map(
      (name, index) =>
        normalizeColorHex(nextHexValues[index] ?? '') ||
        options.find(
          (option) =>
            option.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )?.hex ||
        colorNameToHex(name),
    )
    onCommit({
      text: nextValue.trim(),
      hexText: resolvedHexes.every(Boolean) ? resolvedHexes.join(', ') : '',
      ids,
    })
  }
  function selectOption(option: { name: string; hex: string }) {
    const index = getActiveColorIndex(value)
    const segments = splitColorSegments(value)
    segments[index] = option.name
    const nextValue = segments.join(', ')
    const nextHexValues = [...hexValues]
    nextHexValues[index] = option.hex
    setValue(nextValue)
    setHexValues(nextHexValues)
    commit(nextValue, nextHexValues)
  }
  function handleHexChange(hex: string) {
    const normalized = normalizeColorHex(hex)
    if (!normalized) return
    const index = getActiveColorIndex(value)
    const segments = splitColorSegments(value)
    segments[index] = matchPaletteHex(normalized).name
    const nextHexValues = [...hexValues]
    nextHexValues[index] = normalized
    const nextValue = segments.join(', ')
    setValue(nextValue)
    setHexValues(nextHexValues)
    commit(nextValue, nextHexValues)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div>
          <Input
            data-receipt-cell-input="true"
            data-receipt-dirty={value !== row.colorText ? 'true' : 'false'}
            role={mode === 'opening-balance' ? 'combobox' : undefined}
            aria-label={
              mode === 'opening-balance' ? `Colour row ${rowNumber}` : 'Colour'
            }
            value={value}
            disabled={disabled}
            placeholder="Colour"
            className={`h-11 w-full rounded-none border-0 bg-transparent px-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'ring-2 ring-inset ring-ring' : ''}`}
            onFocus={() => {
              onActivate()
              setOpen(true)
            }}
            onClick={() => {
              onActivate()
              setOpen(true)
            }}
            onChange={(event) => {
              setValue(event.target.value)
              setOpen(true)
            }}
            onPaste={onPaste}
            onBlur={() =>
              window.setTimeout(() => {
                const activeElement = document.activeElement
                if (
                  activeElement?.getAttribute('data-colour-option') !==
                    'true' &&
                  !activeElement?.closest('[data-slot="popover-content"]')
                ) {
                  commit()
                  setOpen(false)
                }
              }, 0)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                if (suggestions[0]) selectOption(suggestions[0])
                else {
                  commit()
                  setOpen(false)
                }
              }
              if (event.key === 'Escape') {
                setValue(row.colorText)
                setOpen(false)
              }
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Choose colours</p>
          <HexColorField
            value={hexValues[getActiveColorIndex(value)] ?? ''}
            onChange={handleHexChange}
            ariaLabel="Pick a custom colour"
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Type multiple colours separated by commas, or use the picker.
        </p>
        <div className="mt-3 grid max-h-28 grid-cols-2 gap-1.5 overflow-y-auto">
          {options.slice(0, 12).map((option) => (
            <Button
              key={`${option.name}-${option.hex}`}
              type="button"
              size="sm"
              variant={
                selectedNames.has(option.name.toLocaleLowerCase())
                  ? 'default'
                  : 'outline'
              }
              className="justify-start gap-2"
              data-colour-option="true"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              <span
                className="size-3 rounded-full border"
                style={{ backgroundColor: option.hex }}
              />
              <span className="truncate">{option.name}</span>
            </Button>
          ))}
        </div>
        {suggestions.length > 0 && (
          <div
            role="listbox"
            aria-label="Colour suggestions"
            className="mt-2 rounded-md border bg-background p-1"
          >
            {suggestions.map((option) => (
              <button
                key={`${option.name}-${option.hex}`}
                type="button"
                role="option"
                data-colour-option="true"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
              >
                <span
                  className="size-3 rounded-full border"
                  style={{ backgroundColor: option.hex }}
                />
                {option.name}
              </button>
            ))}
          </div>
        )}
        <Button
          type="button"
          className="mt-3 w-full"
          onClick={() => {
            commit()
            setOpen(false)
          }}
        >
          Done
        </Button>
      </PopoverContent>
    </Popover>
  )
}
