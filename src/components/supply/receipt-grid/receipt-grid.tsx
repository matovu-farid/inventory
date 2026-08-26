import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DataEditor, GridCellKind } from '@glideapps/glide-data-grid'
import { Plus, Redo2, Undo2 } from 'lucide-react'
import type {
  EditableGridCell,
  GridCell,
  GridColumn,
  Item,
  ProvideEditorComponent,
  TextCell,
} from '@glideapps/glide-data-grid'
import '@glideapps/glide-data-grid/dist/index.css'
import {
  addReceiptRow,
  applyPasteMatrix,
  calculateGridTotals,
  calculateRowAmount,
  copyReceiptRow,
  copyReceiptRowField,
  createEmptyReceiptRow,
  ensureReceiptRows,
  isReceiptRowEmpty,
  removeReceiptRow,
  updateReceiptCell,
} from './receipt-grid-state'
import { ColorCellEditor } from './color-cell-editor'
import { DesignCellEditor } from './design-cell-editor'
import { SizeCellEditor } from './size-cell-editor'
import { getReceiptGridTheme } from './receipt-grid-theme'
import type { ReceiptGridColumnId, ReceiptGridRow } from './types'

const EDITABLE_COLUMNS: ReceiptGridColumnId[] = [
  'design',
  'articleNumber',
  'colorText',
  'sizeText',
  'quantity',
  'unitPriceForeign',
]

const columns: readonly GridColumn[] = [
  { id: 'remove', title: '', width: 38 },
  { id: 'design', title: 'Design', width: 210 },
  { id: 'articleNumber', title: 'Art No.', width: 140 },
  { id: 'colorText', title: 'Colour', width: 160 },
  { id: 'sizeText', title: 'Size', width: 140 },
  { id: 'quantity', title: 'Qty (pcs)', width: 100 },
  { id: 'unitPriceForeign', title: 'Unit Price', width: 120 },
  { id: 'amount', title: 'Amount', width: 130 },
]

const REMOVE_COLUMN = 0
const DATA_COLUMN_OFFSET = 1

type ReceiptGridHistory = {
  past: ReceiptGridRow[][]
  future: ReceiptGridRow[][]
}

export type ReceiptGridHistoryControls = {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

function cloneReceiptRows(rows: ReceiptGridRow[]): ReceiptGridRow[] {
  return rows.map((row) => copyReceiptRow(row, row.id))
}

function receiptRowsEqual(
  left: ReceiptGridRow[],
  right: ReceiptGridRow[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function isReceiptGridOutsideClick(event: MouseEvent | TouchEvent) {
  const target = event.target
  return !(
    target instanceof Element && target.closest('[data-slot="popover-content"]')
  )
}

function asTextCell(value: string, readOnly = false): TextCell {
  return {
    kind: GridCellKind.Text,
    allowOverlay: !readOnly,
    readonly: readOnly,
    data: value,
    displayData: value,
    copyData: value,
  }
}

export function ReceiptGrid({
  rows,
  disabled = false,
  onRowsChange,
  historyControls,
  undoResetKey,
}: {
  rows: ReceiptGridRow[]
  disabled?: boolean
  onRowsChange: (rows: ReceiptGridRow[]) => void
  historyControls?: ReceiptGridHistoryControls
  undoResetKey?: string
}) {
  const [activeCell, setActiveCell] = useState<Item | null>(null)
  const pendingCatalogSelections = useRef<
    Record<string, ReceiptGridRow['catalogItem']>
  >({})
  const pendingColorSelections = useRef<
    Record<string, { ids: string[]; text: string; hexText: string }>
  >({})
  const gridRootRef = useRef<HTMLDivElement>(null)
  const currentRowsRef = useRef(rows)
  const historyRef = useRef<ReceiptGridHistory>({ past: [], future: [] })
  const lastUndoResetKeyRef = useRef(undoResetKey)
  const [, setHistoryVersion] = useState(0)
  const totals = useMemo(() => calculateGridTotals(rows), [rows])
  const theme = useMemo(() => getReceiptGridTheme(), [])

  currentRowsRef.current = rows

  useEffect(() => {
    if (lastUndoResetKeyRef.current === undoResetKey) return
    lastUndoResetKeyRef.current = undoResetKey
    historyRef.current = { past: [], future: [] }
    setHistoryVersion((version) => version + 1)
  }, [undoResetKey])

  const commitRows = useCallback(
    (nextRows: ReceiptGridRow[]) => {
      const currentRows = currentRowsRef.current
      if (receiptRowsEqual(currentRows, nextRows)) return
      if (historyControls) {
        currentRowsRef.current = nextRows
        onRowsChange(nextRows)
        return
      }
      historyRef.current = {
        past: [...historyRef.current.past, cloneReceiptRows(currentRows)],
        future: [],
      }
      currentRowsRef.current = nextRows
      setHistoryVersion((version) => version + 1)
      onRowsChange(nextRows)
    },
    [historyControls, onRowsChange],
  )

  const undoHistory = useCallback(() => {
    if (historyControls) {
      if (!disabled) historyControls.onUndo()
      return
    }
    const history = historyRef.current
    const previous = history.past.at(-1)
    if (disabled || !previous) return
    const currentRows = currentRowsRef.current
    historyRef.current = {
      past: history.past.slice(0, -1),
      future: [...history.future, cloneReceiptRows(currentRows)],
    }
    currentRowsRef.current = previous
    setHistoryVersion((version) => version + 1)
    onRowsChange(previous)
  }, [disabled, historyControls, onRowsChange])

  const redoHistory = useCallback(() => {
    if (historyControls) {
      if (!disabled) historyControls.onRedo()
      return
    }
    const history = historyRef.current
    const nextRows = history.future.at(-1)
    if (disabled || !nextRows) return
    const currentRows = currentRowsRef.current
    historyRef.current = {
      past: [...history.past, cloneReceiptRows(currentRows)],
      future: history.future.slice(0, -1),
    }
    currentRowsRef.current = nextRows
    setHistoryVersion((version) => version + 1)
    onRowsChange(nextRows)
  }, [disabled, historyControls, onRowsChange])

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      const target = event.target
      if (
        disabled ||
        !gridRootRef.current ||
        !(target instanceof Node && gridRootRef.current.contains(target)) ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return

      const key = event.key.toLocaleLowerCase()
      const isUndo =
        key === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey
      const isRedo =
        key === 'z' && (event.metaKey || event.ctrlKey) && event.shiftKey
      const isWindowsRedo = key === 'y' && event.ctrlKey && !event.metaKey
      if (!isUndo && !isRedo && !isWindowsRedo) return

      event.preventDefault()
      if (isUndo) undoHistory()
      else redoHistory()
    }

    window.addEventListener('keydown', handleHistoryShortcut, true)
    return () =>
      window.removeEventListener('keydown', handleHistoryShortcut, true)
  }, [disabled, redoHistory, undoHistory])

  const getCellContent = useCallback(
    ([column, rowIndex]: Item): GridCell => {
      const row = rows.at(rowIndex)
      if (!row) return asTextCell('', true)
      if (column === REMOVE_COLUMN) {
        return asTextCell(isReceiptRowEmpty(row) ? '' : '−', true)
      }
      switch (column - DATA_COLUMN_OFFSET) {
        case 0:
          return asTextCell(row.design)
        case 1:
          return asTextCell(row.articleNumber)
        case 2:
          return asTextCell(row.colorText || 'Choose colour')
        case 3:
          return asTextCell(row.sizeText || 'Choose size')
        case 4:
          return asTextCell(row.quantity === null ? '' : String(row.quantity))
        case 5:
          return asTextCell(row.unitPriceForeign)
        case 6:
          return asTextCell(calculateRowAmount(row), true)
        default:
          return asTextCell('', true)
      }
    },
    [rows],
  )

  const updateAt = useCallback(
    (rowIndex: number, column: ReceiptGridColumnId, value: string) => {
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

  function handleCellEdited(cell: Item, newValue: EditableGridCell) {
    if (
      disabled ||
      cell[0] <= REMOVE_COLUMN ||
      cell[0] > EDITABLE_COLUMNS.length
    )
      return
    const value = 'data' in newValue ? String(newValue.data ?? '') : ''
    const column = EDITABLE_COLUMNS[cell[0] - DATA_COLUMN_OFFSET]
    const editableRows = ensureReceiptRows(rows, cell[1] + 1)
    if (column === 'design') {
      const pendingCatalog = pendingCatalogSelections.current[String(cell[1])]
      delete pendingCatalogSelections.current[String(cell[1])]
      const row = editableRows.at(cell[1])
      const catalogLabel = row?.catalogItem
        ? [row.catalogItem.design, row.catalogItem.name]
        : []
      const nextRows = updateReceiptCell(editableRows, cell[1], column, value)
      commitRows(
        pendingCatalog
          ? nextRows.map((entry, index) =>
              index === cell[1]
                ? {
                    ...entry,
                    itemId: pendingCatalog.id,
                    catalogItem: pendingCatalog,
                    articleNumber:
                      pendingCatalog.articleNumbers.length === 1
                        ? pendingCatalog.articleNumbers[0].articleNumber
                        : '',
                  }
                : entry,
            )
          : catalogLabel.includes(value.trim())
            ? nextRows
            : nextRows.map((entry, index) =>
                index === cell[1]
                  ? { ...entry, itemId: null, catalogItem: null, colorIds: [] }
                  : entry,
              ),
      )
      return
    }
    if (column === 'colorText') {
      const pendingKey = String(cell[1])
      const pending = Object.prototype.hasOwnProperty.call(
        pendingColorSelections.current,
        pendingKey,
      )
        ? pendingColorSelections.current[pendingKey]
        : undefined
      delete pendingColorSelections.current[pendingKey]
      const nextRows = updateReceiptCell(editableRows, cell[1], column, value)
      commitRows(
        pending
          ? nextRows.map((entry, index) =>
              index === cell[1]
                ? {
                    ...entry,
                    colorIds: pending.ids,
                    colorText: pending.text,
                    colorHexText: pending.hexText,
                  }
                : entry,
            )
          : nextRows,
      )
      return
    }
    updateAt(cell[1], column, value)
  }

  function handleFillPattern(event: {
    patternSource: { x: number; y: number; width: number; height: number }
    fillDestination: { x: number; y: number; width: number; height: number }
    preventDefault: () => void
  }) {
    if (disabled) return
    event.preventDefault()
    const source = event.patternSource
    const destination = event.fillDestination
    const sourceRows = rows.map((row) => copyReceiptRow(row, row.id))
    const reachesBottom = destination.y + destination.height >= rows.length
    let next = ensureReceiptRows(
      rows,
      destination.y + destination.height + (reachesBottom ? 1 : 0),
    )
    for (
      let rowIndex = destination.y;
      rowIndex < destination.y + destination.height;
      rowIndex += 1
    ) {
      for (
        let columnIndex = destination.x;
        columnIndex < destination.x + destination.width;
        columnIndex += 1
      ) {
        const sourceRow =
          source.y + ((rowIndex - destination.y) % source.height)
        const sourceColumn =
          source.x + ((columnIndex - destination.x) % source.width)
        if (
          sourceColumn <= REMOVE_COLUMN ||
          sourceColumn > EDITABLE_COLUMNS.length
        )
          continue
        const column = EDITABLE_COLUMNS[sourceColumn - DATA_COLUMN_OFFSET]
        if (sourceRow < 0 || sourceRow >= sourceRows.length) continue
        const sourceValue = sourceRows[sourceRow]
        const copied = copyReceiptRowField(sourceValue, column)
        next = next.map((row, index) =>
          index === rowIndex ? { ...row, ...copied } : row,
        )
      }
    }
    commitRows(next)
  }

  function handleRowDelete(rowIndex: number) {
    if (disabled || !rows[rowIndex]) return
    commitRows(removeReceiptRow(rows, rowIndex))
  }

  function handleAddRow() {
    if (disabled) return
    commitRows(addReceiptRow(rows))
  }

  function handleBlankRowInteraction(rowIndex: number) {
    if (disabled || rowIndex < 0 || rowIndex !== rows.length - 1) return
    const row = rows[rowIndex]
    if (!isReceiptRowEmpty(row)) return
    commitRows([...rows, createEmptyReceiptRow(crypto.randomUUID())])
  }

  function editorForCell(cell: GridCell) {
    const column = activeCell?.[0]
    const rowIndex = activeCell?.[1] ?? -1
    if (
      disabled ||
      column === undefined ||
      column <= REMOVE_COLUMN ||
      rowIndex < 0
    )
      return undefined
    const dataColumn = column - DATA_COLUMN_OFFSET
    const textCell = cell as TextCell
    if (dataColumn === 0) {
      const Editor: ProvideEditorComponent<GridCell> = (props) => (
        <DesignCellEditor
          value={props.value as TextCell}
          onChange={(value) => props.onChange(value)}
          onFinishedEditing={(value, movement) => {
            if (!value)
              delete pendingCatalogSelections.current[String(rowIndex)]
            props.onFinishedEditing(value, movement)
          }}
          onCatalogItemSelected={(item) => {
            if (rowIndex < 0) return
            pendingCatalogSelections.current[String(rowIndex)] = item
          }}
        />
      )
      return Editor
    }
    if (dataColumn === 2) {
      const Editor: ProvideEditorComponent<GridCell> = (props) => (
        <ColorCellEditor
          initialValue={rows[rowIndex]?.colorText ?? textCell.data}
          initialHexValue={rows[rowIndex]?.colorHexText ?? ''}
          catalogItem={rows[rowIndex]?.catalogItem ?? null}
          onChange={(value) => props.onChange(value)}
          onFinishedEditing={(value, movement) =>
            props.onFinishedEditing(value, movement)
          }
          onColorSelection={(ids, text, hexText) => {
            pendingColorSelections.current[String(rowIndex)] = {
              ids,
              text,
              hexText,
            }
          }}
        />
      )
      return Editor
    }
    if (dataColumn === 3) {
      const Editor: ProvideEditorComponent<GridCell> = (props) => (
        <SizeCellEditor
          initialValue={rows[rowIndex]?.sizeText ?? textCell.data}
          catalogItem={rows[rowIndex]?.catalogItem ?? null}
          onChange={(value) => props.onChange(value)}
          onFinishedEditing={(value, movement) =>
            props.onFinishedEditing(value, movement)
          }
        />
      )
      return Editor
    }
    return undefined
  }

  return (
    <div
      ref={gridRootRef}
      className="min-w-[1000px] overflow-hidden rounded-md border bg-background"
    >
      <DataEditor
        columns={columns}
        rows={rows.length}
        getCellContent={getCellContent}
        getCellsForSelection
        rowMarkers={{ kind: 'number', startIndex: 1 }}
        freezeColumns={2}
        rangeSelect="rect"
        fillHandle={!disabled}
        allowedFillDirections="vertical"
        editOnType
        cellActivationBehavior="second-click"
        onCellClicked={([column, rowIndex]) => {
          if (
            column === REMOVE_COLUMN &&
            rows[rowIndex] &&
            !isReceiptRowEmpty(rows[rowIndex])
          ) {
            handleRowDelete(rowIndex)
            return
          }
          if (column > REMOVE_COLUMN) handleBlankRowInteraction(rowIndex)
        }}
        onCellActivated={(cell) => {
          setActiveCell(cell)
          handleBlankRowInteraction(cell[1])
        }}
        onCellEdited={handleCellEdited}
        onFillPattern={handleFillPattern}
        onPaste={(target, values) => {
          if (
            disabled ||
            target[0] <= REMOVE_COLUMN ||
            target[0] > EDITABLE_COLUMNS.length ||
            target[1] < 0
          ) {
            return false
          }
          const requiredRows = target[1] + values.length
          const pasteRows = [...rows]
          while (pasteRows.length < requiredRows) {
            pasteRows.push(createEmptyReceiptRow(crypto.randomUUID()))
          }
          commitRows(
            applyPasteMatrix(
              pasteRows,
              {
                row: target[1],
                column: EDITABLE_COLUMNS[target[0] - DATA_COLUMN_OFFSET],
              },
              values,
            ),
          )
          return false
        }}
        provideEditor={editorForCell}
        width="100%"
        height={Math.max(150, Math.min(380, 44 + rows.length * 34))}
        className="receipt-grid"
        theme={theme}
        isOutsideClick={isReceiptGridOutsideClick}
      />
      {!disabled && (
        <button
          type="button"
          className="flex w-full items-center gap-2 border-t px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          onClick={handleAddRow}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add receipt line
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Undo"
            title="Undo (⌘/Ctrl+Z)"
            onClick={undoHistory}
            disabled={
              disabled ||
              (historyControls
                ? !historyControls.canUndo
                : historyRef.current.past.length === 0)
            }
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Undo
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Redo"
            title="Redo (⌘/Ctrl+Shift+Z or Ctrl+Y)"
            onClick={redoHistory}
            disabled={
              disabled ||
              (historyControls
                ? !historyControls.canRedo
                : historyRef.current.future.length === 0)
            }
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
            Total amount:{' '}
            <strong className="text-foreground">
              {totals.totalAmountForeign}
            </strong>
          </span>
        </div>
      </div>
    </div>
  )
}
