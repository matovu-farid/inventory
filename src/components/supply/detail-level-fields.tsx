import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { FieldLabel } from '#/components/ui/field-label'
import { VariantGrid } from '#/components/items/variant-grid'
import { ColorQuantityList } from '#/components/supply/split-item-form'
import { getDetailModeOptions } from '#/lib/supply/detail-level'
import type { DetailColor, DetailMode } from '#/lib/supply/detail-level'

export function DetailLevelFields({
  colors,
  sizes,
  detailMode,
  onDetailModeChange,
  aggregateQty,
  onAggregateQtyChange,
  colorQtys,
  onColorQtysChange,
  quantities,
  onQuantitiesChange,
  error,
  onRemoveColor,
}: {
  colors: DetailColor[]
  sizes: string[]
  detailMode: DetailMode
  onDetailModeChange: (mode: DetailMode) => void
  aggregateQty: string
  onAggregateQtyChange: (value: string) => void
  colorQtys: Record<string, number>
  onColorQtysChange: (values: Record<string, number>) => void
  quantities: Record<string, number>
  onQuantitiesChange: (values: Record<string, number>) => void
  error?: string
  onRemoveColor?: (colorId: string) => void
}) {
  const options = getDetailModeOptions(colors, sizes)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <FieldLabel help="item.detailMode">Detail level</FieldLabel>
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              onClick={() => onDetailModeChange(option.value)}
              className={
                'rounded px-3 py-1.5 transition-colors ' +
                (detailMode === option.value
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted')
              }
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {detailMode === 'aggregate'
            ? "Just record how many units you're buying. An admin can split into colors/sizes later before receiving."
            : detailMode === 'colors'
              ? 'Record quantity per color. Sizes can be filled in later.'
              : 'Full breakdown by color and size.'}
        </p>
      </div>

      {detailMode === 'aggregate' && (
        <div className="space-y-2">
          <FieldLabel help="item.aggregateQty">Total quantity *</FieldLabel>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={aggregateQty}
            onChange={(event) => onAggregateQtyChange(event.target.value)}
            placeholder="0"
            aria-invalid={!!error || undefined}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {detailMode === 'colors' && (
        <ColorQuantityList
          colors={colors}
          values={colorQtys}
          onChange={onColorQtysChange}
          onRemoveColor={onRemoveColor}
          error={error}
        />
      )}

      {detailMode === 'variants' && (
        <>
          <VariantGrid
            sizes={sizes}
            colors={colors}
            quantities={quantities}
            onChange={onQuantitiesChange}
            onRemoveColor={onRemoveColor}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
    </div>
  )
}
