import { useEffect, useMemo, useState } from 'react'
import { ListTree, RotateCcw } from 'lucide-react'
import { ColorQuantityList } from '#/components/supply/split-item-form'
import { VariantGrid } from '#/components/items/variant-grid'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { colorNameToHex, splitColorSegments } from '#/lib/colors/receipt-colors'
import {
  cloneDistribution,
  distributionSummary,
  distributionTotal,
  validateDistribution,
} from '#/components/item-entry-grid/distribution-state'
import type { ReceiptQuantityDistribution } from '#/components/item-entry-grid/distribution-types'
import type { ReceiptGridRow } from './types'

type ColorOption = { id: string; colorName: string; colorHex: string }

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function rowColors(row: ReceiptGridRow): ColorOption[] {
  const fromCatalog = row.catalogItem?.colors ?? []
  const names = splitColorSegments(row.colorText).filter(Boolean)
  const options: ColorOption[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const catalogColor = fromCatalog.find(
      (color) => normalize(color.colorName) === normalize(name),
    )
    const id = catalogColor?.id ?? `text:${normalize(name)}`
    const key = normalize(name)
    if (seen.has(key)) continue
    seen.add(key)
    options.push({
      id,
      colorName: catalogColor?.colorName ?? name,
      colorHex: catalogColor?.colorHex ?? (colorNameToHex(name) || '#808080'),
    })
  }
  return options
}

function rowSizes(row: ReceiptGridRow) {
  const typed = row.sizeText
    .split(',')
    .map((size) => size.trim())
    .filter(Boolean)
  return Array.from(new Set(typed))
}

function distributionToColorValues(
  distribution: ReceiptQuantityDistribution | null,
  colors: ColorOption[],
) {
  const values: Record<string, number> = {}
  for (const cell of distribution?.cells ?? []) {
    const color = colors.find(
      (option) => normalize(option.colorName) === normalize(cell.color),
    )
    if (color && !cell.size) values[color.id] = cell.quantity
  }
  return values
}

function distributionToCellValues(
  distribution: ReceiptQuantityDistribution | null,
  colors: ColorOption[],
) {
  const values: Record<string, number> = {}
  for (const cell of distribution?.cells ?? []) {
    if (!cell.size) continue
    const color = colors.find(
      (option) => normalize(option.colorName) === normalize(cell.color),
    )
    if (color) values[`${color.id}|${cell.size}`] = cell.quantity
  }
  return values
}

export function QuantityDistributionEditor({
  row,
  open,
  disabled,
  onOpenChange,
  onApply,
}: {
  row: ReceiptGridRow
  open: boolean
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onApply: (
    distribution: ReceiptQuantityDistribution | null,
    derivedQuantity?: number,
  ) => void
}) {
  const colors = useMemo(() => rowColors(row), [row])
  const sizes = useMemo(() => rowSizes(row), [row])
  const mode: ReceiptQuantityDistribution['mode'] =
    sizes.length > 0 ? 'variants' : 'colors'
  const [colorValues, setColorValues] = useState<Record<string, number>>({})
  const [cellValues, setCellValues] = useState<Record<string, number>>({})
  const [workingMode, setWorkingMode] =
    useState<ReceiptQuantityDistribution['mode']>(mode)

  useEffect(() => {
    if (!open) return
    setWorkingMode(row.distribution?.mode ?? mode)
    setColorValues(distributionToColorValues(row.distribution, colors))
    setCellValues(distributionToCellValues(row.distribution, colors))
  }, [colors, mode, open, row])

  const workingDistribution: ReceiptQuantityDistribution = {
    mode: workingMode,
    cells:
      workingMode === 'colors'
        ? colors.map((color) => ({
            color: color.colorName,
            colorId: color.id.startsWith('text:') ? null : color.id,
            colorHex: color.colorHex,
            quantity: colorValues[color.id] ?? 0,
          }))
        : colors.flatMap((color) =>
            sizes.map((size) => ({
              color: color.colorName,
              colorId: color.id.startsWith('text:') ? null : color.id,
              colorHex: color.colorHex,
              size,
              quantity: cellValues[`${color.id}|${size}`] ?? 0,
            })),
          ),
  }
  const validation = validateDistribution(workingDistribution, row.quantity)
  const summary = distributionSummary(workingDistribution)
  const remainder = (() => {
    if (row.quantity === null || workingDistribution.cells.length < 2) {
      return null
    }
    const emptyCells = workingDistribution.cells.filter(
      (cell) => cell.quantity === 0,
    )
    const hasOnlyWholeNonNegativeQuantities = workingDistribution.cells.every(
      (cell) => Number.isInteger(cell.quantity) && cell.quantity >= 0,
    )
    const total = distributionTotal(workingDistribution)
    if (
      emptyCells.length !== 1 ||
      !hasOnlyWholeNonNegativeQuantities ||
      total >= row.quantity
    ) {
      return null
    }
    const cell = emptyCells[0]
    return {
      cell,
      quantity: row.quantity - total,
    }
  })()

  function clear() {
    onApply(null)
    onOpenChange(false)
  }

  function apply() {
    if (!validation.valid) return
    onApply(
      {
        mode: workingMode,
        cells: workingDistribution.cells,
      },
      row.quantity ?? distributionTotal(workingDistribution),
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle>
            {row.quantity === null
              ? 'Distribute quantity'
              : `Distribute ${row.quantity.toLocaleString()} pieces`}
          </DialogTitle>
          <DialogDescription>
            {row.quantity === null
              ? 'Enter quantities below. The row quantity will be calculated from the total you distribute.'
              : `Optional: allocate this row by ${workingMode === 'colors' ? 'colour' : 'colour and size'}. The allocation must equal ${row.quantity.toLocaleString()} pieces.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {colors.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              Enter at least one colour in the row before distributing quantity.
            </div>
          ) : (
            <>
              {sizes.length > 0 && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/20 p-1 text-sm">
                  <Button
                    type="button"
                    size="sm"
                    variant={workingMode === 'colors' ? 'default' : 'ghost'}
                    onClick={() => setWorkingMode('colors')}
                  >
                    Colours only
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={workingMode === 'variants' ? 'default' : 'ghost'}
                    onClick={() => setWorkingMode('variants')}
                  >
                    Colours × sizes
                  </Button>
                </div>
              )}
              {workingMode === 'colors' ? (
                <ColorQuantityList
                  colors={colors}
                  values={colorValues}
                  onChange={setColorValues}
                />
              ) : (
                <VariantGrid
                  sizes={sizes}
                  colors={colors}
                  quantities={cellValues}
                  onChange={setCellValues}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <ListTree className="size-4" aria-hidden="true" />
                  {summary}
                </span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {remainder && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => {
                        if (workingMode === 'colors') {
                          const color = colors.find(
                            (option) =>
                              normalize(option.colorName) ===
                              normalize(remainder.cell.color),
                          )
                          if (!color) return
                          setColorValues((values) => ({
                            ...values,
                            [color.id]: remainder.quantity,
                          }))
                        } else {
                          const color = colors.find(
                            (option) =>
                              normalize(option.colorName) ===
                              normalize(remainder.cell.color),
                          )
                          if (!color || !remainder.cell.size) return
                          setCellValues((values) => ({
                            ...values,
                            [`${color.id}|${remainder.cell.size}`]:
                              remainder.quantity,
                          }))
                        }
                      }}
                    >
                      Fill {remainder.cell.color}
                      {remainder.cell.size
                        ? ` / ${remainder.cell.size}`
                        : ''}{' '}
                      with {remainder.quantity.toLocaleString()}
                    </Button>
                  )}
                  <span
                    className={
                      validation.valid
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-destructive'
                    }
                  >
                    {validation.valid ? 'Ready to apply' : validation.message}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter className="pt-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={clear}
            disabled={disabled}
          >
            <RotateCcw className="mr-2 size-4" aria-hidden="true" />
            Clear distribution
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={apply}
              disabled={disabled || !validation.valid}
            >
              Apply distribution
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function cloneReceiptDistribution(
  distribution: ReceiptQuantityDistribution | null,
) {
  return cloneDistribution(distribution)
}
