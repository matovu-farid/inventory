import { useMemo } from 'react'
import { X } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

interface Color {
  id: string
  colorName: string
  colorHex: string
}

interface Props {
  sizes: string[]
  colors: Color[]
  quantities: Record<string, number>
  onChange: (next: Record<string, number>) => void
  onRemoveColor?: (itemColorId: string) => void
}

export function VariantGrid({
  sizes,
  colors,
  quantities,
  onChange,
  onRemoveColor,
}: Props) {
  function setCell(itemColorId: string, size: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    const next = { ...quantities, [`${itemColorId}|${size}`]: n }
    if (n === 0) delete next[`${itemColorId}|${size}`]
    onChange(next)
  }
  const total = useMemo(
    () => Object.values(quantities).reduce((s, x) => s + x, 0),
    [quantities],
  )

  if (colors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add at least one color to enter quantities.
      </p>
    )
  }
  if (sizes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This item has no sizes defined.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="p-2 text-left font-medium">Color</th>
              {sizes.map((s) => (
                <th
                  key={s}
                  className="p-2 text-center font-medium w-24 min-w-24"
                >
                  {s}
                </th>
              ))}
              {onRemoveColor && (
                <th className="w-10 min-w-10" aria-label="Actions" />
              )}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block size-4 rounded border"
                      style={{ backgroundColor: c.colorHex }}
                      aria-hidden
                    />
                    {c.colorName}
                  </span>
                </td>
                {sizes.map((s) => {
                  const key = `${c.id}|${s}`
                  return (
                    <td key={s} className="p-1">
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={quantities[key] ?? ''}
                        onChange={(e) =>
                          setCell(
                            c.id,
                            s,
                            e.target.value.replace(/[^0-9]/g, ''),
                          )
                        }
                        className={cn(
                          'h-9 px-2 text-right tabular-nums',
                          quantities[key] ? '' : 'text-muted-foreground',
                        )}
                      />
                    </td>
                  )
                })}
                {onRemoveColor && (
                  <td className="p-1 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${c.colorName}`}
                      onClick={() => onRemoveColor(c.id)}
                    >
                      <X className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Total units: <span className="font-mono">{total}</span>
      </p>
    </div>
  )
}
