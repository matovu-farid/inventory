import { HexColorPicker, HexColorInput } from "react-colorful"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { cn } from "#/lib/utils"

interface Props {
  value: string
  onChange: (hex: string) => void
  className?: string
  ariaLabel?: string
}

export function HexColorField({
  value,
  onChange,
  className,
  ariaLabel = "Pick color",
}: Props) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={ariaLabel}
        className={cn(
          "h-10 w-12 rounded border bg-background",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
        style={{ backgroundColor: safe }}
      />
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          <HexColorPicker color={safe} onChange={onChange} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#</span>
            <HexColorInput
              color={safe}
              onChange={onChange}
              prefixed={false}
              className="h-9 w-full rounded-md border bg-background px-2 font-mono text-sm uppercase ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Hex color value"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
