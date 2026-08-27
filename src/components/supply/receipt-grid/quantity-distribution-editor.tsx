import { useEffect, useMemo, useState } from 'react'
import { ListTree, RotateCcw } from 'lucide-react'
import { ColorQuantityList } from '#/components/supply/split-item-form'
import { VariantGrid } from '#/components/items/variant-grid'
import { Button } from '#/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import { colorNameToHex, splitColorSegments } from '#/lib/colors/receipt-colors'
import {
  cloneDistribution,
  distributionSummary,
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
  onApply: (distribution: ReceiptQuantityDistribution | null) => void
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

  const quantity = row.quantity ?? 0
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

  function clear() {
    onApply(null)
    onOpenChange(false)
  }

  function apply() {
    if (!validation.valid) return
    onApply({
      mode: workingMode,
      cells: workingDistribution.cells,
    })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader className="mx-auto w-full max-w-4xl px-0">
          <SheetTitle>Distribute {quantity.toLocaleString()} pieces</SheetTitle>
          <SheetDescription>
            Optional: allocate this row by{' '}
            {workingMode === 'colors' ? 'colour' : 'colour and size'}. The
            allocation must equal the row quantity.
          </SheetDescription>
        </SheetHeader>
        <div className="mx-auto w-full max-w-4xl space-y-4">
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
            </>
          )}
        </div>
        <SheetFooter className="mx-auto w-full max-w-4xl px-0 sm:flex-row sm:justify-between">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function cloneReceiptDistribution(
  distribution: ReceiptQuantityDistribution | null,
) {
  return cloneDistribution(distribution)
}
