import { useMemo } from "react"
import { Input } from "#/components/ui/input"
import { cn } from "#/lib/utils"

interface Color { id: string; colorName: string; colorHex: string }

interface Props {
  sizes: string[]
  colors: Color[]
  quantities: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

export function VariantGrid({ sizes, colors, quantities, onChange }: Props) {
  function setCell(productColorId: string, size: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0))
    const next = { ...quantities, [`${productColorId}|${size}`]: n }
    if (n === 0) delete next[`${productColorId}|${size}`]
    onChange(next)
  }
  const total = useMemo(() => Object.values(quantities).reduce((s, x) => s + x, 0), [quantities])

  if (colors.length === 0) {
    return <p className="text-sm text-muted-foreground">Add at least one color to enter quantities.</p>
  }
  if (sizes.length === 0) {
    return <p className="text-sm text-muted-foreground">This product has no sizes defined.</p>
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="p-2 text-left font-medium">Color</th>
              {sizes.map((s) => <th key={s} className="p-2 text-center font-medium w-20">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block size-4 rounded border" style={{ backgroundColor: c.colorHex }} aria-hidden />
                    {c.colorName}
                  </span>
                </td>
                {sizes.map((s) => {
                  const key = `${c.id}|${s}`
                  return (
                    <td key={s} className="p-1">
                      <Input
                        type="number" min={0} inputMode="numeric"
                        value={quantities[key] ?? ""}
                        onChange={(e) => setCell(c.id, s, e.target.value)}
                        className={cn("h-9 text-right tabular-nums", quantities[key] ? "" : "text-muted-foreground")}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Total units: <span className="font-mono">{total}</span></p>
    </div>
  )
}
