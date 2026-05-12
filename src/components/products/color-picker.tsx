import { useState } from "react"
import { CLOTHING_PALETTE, type PaletteColor } from "#/lib/colors/palette"
import { matchPaletteHex } from "#/lib/colors/match-palette"
import { Input } from "#/components/ui/input"
import { cn } from "#/lib/utils"

interface Props {
  colorName: string
  colorHex: string
  onChange: (next: { colorName: string; colorHex: string }) => void
  sampledHex?: string | null
}

export function ColorPicker({ colorName, colorHex, onChange, sampledHex }: Props) {
  const [, setCustomMode] = useState(false)

  function pickTile(tile: PaletteColor) {
    setCustomMode(false)
    onChange({ colorName: tile.name, colorHex: tile.hex })
  }
  function pickCustomHex(hex: string) {
    const match = matchPaletteHex(hex)
    onChange({ colorName: colorName || match.name, colorHex: hex })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2">
        {CLOTHING_PALETTE.map((tile) => {
          const selected = tile.hex.toLowerCase() === colorHex.toLowerCase()
          return (
            <button
              key={tile.hex}
              type="button"
              onClick={() => pickTile(tile)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-1 text-xs hover:bg-muted",
                selected && "ring-2 ring-primary",
              )}
            >
              <span aria-hidden className="block size-6 rounded border" style={{ backgroundColor: tile.hex }} />
              <span className="truncate w-full text-center">{tile.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Color name (e.g. Burgundy)"
          value={colorName}
          onChange={(e) => onChange({ colorName: e.target.value, colorHex })}
        />
        <input
          type="color"
          aria-label="Custom color"
          value={colorHex || "#000000"}
          onChange={(e) => { setCustomMode(true); pickCustomHex(e.target.value) }}
          className="h-9 w-12 cursor-pointer rounded border"
        />
      </div>
      {sampledHex && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          Sampled from image:
          <span aria-hidden className="inline-block size-3 rounded border" style={{ backgroundColor: sampledHex }} />
          <code>{sampledHex}</code>
        </p>
      )}
    </div>
  )
}
