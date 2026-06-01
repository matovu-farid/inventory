import { useCallback, useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { FieldLabel } from "#/components/ui/field-label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { CreatableCombobox } from "#/components/ui/creatable-combobox"
import { HexColorField } from "#/components/items/hex-color-field"
import { addItemColor } from "#/server/functions/items/colors"
import { specifyStock } from "#/server/functions/store/specify"
import { specifyShopStock } from "#/server/functions/shop/specify"

interface ItemColor {
  id: string
  colorName: string
  colorHex: string
}

interface DraftLine {
  key: string
  /** Resolved item_colors.id, or null when this row references a not-yet-created color. */
  colorId: string | null
  /** User-visible color name. Drives the CreatableCombobox value. */
  colorName: string
  /** Hex for a new color when colorId is null. Ignored when colorId resolves. */
  colorHex: string
  size: string
  quantity: number
}

const DEFAULT_NEW_COLOR_HEX = "#888888"

/**
 * Dialog for splitting an unresolved store_stock row into one or more
 * (color, size, quantity) lines. Backed by the {@link specifyStock} server fn
 * (see Task 11). Users can pick existing item colors or create a new one
 * inline — new colors are materialised via {@link addItemColor} just-in-time
 * on submit so we don't leave orphan colors behind if the user cancels.
 */
export function SpecifyStockDialog({
  open,
  onOpenChange,
  target,
  stockId,
  itemId,
  articleNumber,
  itemName,
  available,
  itemColors,
  fixedColor,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Which stock domain we're specifying against. Drives whether we call
   * {@link specifyStock} (warehouse) or {@link specifyShopStock} (shop).
   */
  target: "store" | "shop"
  /** Source store_stock.id or shop_stock.id depending on `target`. */
  stockId: string
  itemId: string
  articleNumber: string
  itemName: string
  available: number
  itemColors: ReadonlyArray<ItemColor>
  fixedColor?: ItemColor | null
  onSuccess: () => void
}) {
  const makeEmptyLine = useCallback(
    (): DraftLine => ({
      key: crypto.randomUUID(),
      colorId: fixedColor?.id ?? null,
      colorName: fixedColor?.colorName ?? "",
      colorHex: fixedColor?.colorHex ?? DEFAULT_NEW_COLOR_HEX,
      size: "",
      quantity: 0,
    }),
    [fixedColor?.id, fixedColor?.colorName, fixedColor?.colorHex],
  )

  const [lines, setLines] = useState<DraftLine[]>(() => [makeEmptyLine()])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const colorOptions = useMemo(
    () => itemColors.map((c) => c.colorName),
    [itemColors],
  )

  const specified = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity || 0), 0),
    [lines],
  )
  const remaining = available - specified
  const overAllocated = remaining < 0
  const valid =
    lines.every(
      (l) =>
        l.colorName.trim().length > 0 &&
        l.size.trim().length > 0 &&
        l.quantity > 0,
    ) &&
    !overAllocated &&
    specified > 0

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) =>
      ls.map((x) => (x.key === key ? { ...x, ...patch } : x)),
    )
  }

  function setColorName(line: DraftLine, nextName: string) {
    const trimmed = nextName.trim()
    const match = itemColors.find(
      (c) => c.colorName.toLowerCase() === trimmed.toLowerCase(),
    )
    if (match) {
      updateLine(line.key, {
        colorId: match.id,
        colorName: match.colorName,
        colorHex: match.colorHex,
      })
    } else {
      // New color path — keep colorId null so we know to materialise on submit.
      updateLine(line.key, {
        colorId: null,
        colorName: trimmed,
        colorHex:
          line.colorHex && line.colorHex !== DEFAULT_NEW_COLOR_HEX
            ? line.colorHex
            : DEFAULT_NEW_COLOR_HEX,
      })
    }
  }

  function addLine() {
    setLines((ls) => [...ls, makeEmptyLine()])
  }

  function removeLine(key: string) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((l) => l.key !== key)))
  }

  function resetForm() {
    setLines([makeEmptyLine()])
    setError(null)
  }

  async function submit() {
    if (!valid) return
    setPending(true)
    setError(null)
    try {
      // Materialise any not-yet-created colors first so we always send
      // resolved colorIds to specifyStock.
      const resolved: Array<{
        colorId: string
        size: string
        quantity: number
      }> = []
      for (const l of lines) {
        let colorId = l.colorId
        if (!colorId) {
          const created = await addItemColor({
            data: {
              itemId,
              colorName: l.colorName.trim(),
              colorHex: l.colorHex,
            },
          })
          colorId = created.id
        }
        resolved.push({
          colorId,
          size: l.size.trim(),
          quantity: l.quantity,
        })
      }

      if (target === "shop") {
        await specifyShopStock({
          data: {
            shopStockId: stockId,
            lines: resolved,
          },
        })
      } else {
        await specifyStock({
          data: {
            storeStockId: stockId,
            lines: resolved,
          },
        })
      }
      onSuccess()
      onOpenChange(false)
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to specify")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) resetForm()
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {fixedColor
              ? `Specify sizes for ${articleNumber} ${fixedColor.colorName} — ${available} units`
              : `Specify variants for ${articleNumber} — ${available} units`}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground inline-flex flex-wrap items-center gap-1.5">
          {fixedColor ? (
            <>
              <span>{itemName} ·</span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block size-3 rounded-full border"
                  style={{ backgroundColor: fixedColor.colorHex }}
                  aria-hidden
                />
                {fixedColor.colorName}
              </span>
              <span>· Add one row per size you want to label. You can label part of the quantity now and leave the rest for later.</span>
            </>
          ) : (
            <span>
              {itemName}. Add one row per (color, size) you want to label. You can label part of the quantity now and leave the rest for later.
            </span>
          )}
        </p>

        <div className="space-y-2">
          {lines.map((l) => {
            const isNewColor = l.colorName.trim().length > 0 && !l.colorId
            return (
              <div
                key={l.key}
                className="grid grid-cols-12 gap-2 items-end"
              >
                {!fixedColor && (
                  <div className="col-span-5">
                    <FieldLabel>Color</FieldLabel>
                    <div className="flex items-center gap-2">
                      <CreatableCombobox
                        options={colorOptions}
                        value={l.colorName}
                        onChange={(next) => setColorName(l, next)}
                        placeholder="Pick or create color"
                        className="min-w-[12rem]"
                      />
                      {isNewColor && (
                        <HexColorField
                          value={l.colorHex}
                          onChange={(hex) => updateLine(l.key, { colorHex: hex })}
                          ariaLabel={`Pick hex for new color ${l.colorName}`}
                          className="h-9 w-10 shrink-0"
                        />
                      )}
                    </div>
                  </div>
                )}
                <div className={fixedColor ? "col-span-7" : "col-span-4"}>
                  <FieldLabel>Size</FieldLabel>
                  <Input
                    value={l.size}
                    onChange={(e) =>
                      updateLine(l.key, { size: e.target.value })
                    }
                    placeholder="e.g. M"
                  />
                </div>
                <div className={fixedColor ? "col-span-4" : "col-span-2"}>
                  <FieldLabel>Qty</FieldLabel>
                  <Input
                    type="number"
                    min={0}
                    max={available}
                    value={l.quantity || ""}
                    onChange={(e) =>
                      updateLine(l.key, {
                        quantity: Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0),
                        ),
                      })
                    }
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => removeLine(l.key)}
                    disabled={lines.length === 1}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {fixedColor ? "Add size" : "Add variant"}
          </Button>
        </div>

        <p className="text-sm">
          <span className="font-mono">{specified}</span> of{" "}
          <span className="font-mono">{available}</span> specified —{" "}
          {overAllocated ? (
            <span className="text-destructive">
              {Math.abs(remaining)} over the available qty
            </span>
          ) : (
            <span className="text-muted-foreground">
              <span className="font-mono">{remaining}</span> will stay
              as-is
            </span>
          )}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || pending}>
            {pending ? "Specifying…" : "Specify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
