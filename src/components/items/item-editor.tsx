import { useRef, useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Badge } from "#/components/ui/badge"
import { CreatableCombobox } from "#/components/ui/creatable-combobox"
import { X } from "lucide-react"
import { createItem } from "#/server/functions/items/items"
import { matchPaletteHex } from "#/lib/colors/match-palette"
import { CLOTHING_PALETTE } from "#/lib/colors/palette"
import { HexColorField } from "./hex-color-field"
import { InfoTip } from "#/components/ui/info-tip"

const SIZE_QUICK_PICKS = ["XS", "S", "M", "L", "XL", "XXL"]

interface Props {
  categories: ReadonlyArray<string>
  onCreated: (itemId: string, articleNumber: string) => void
}

interface ColorDraft {
  colorName: string
  colorHex: string
}

/**
 * Item create form. After issue #7 the server no longer persists
 * `items.sizes`; this editor collects sizes (and optional colors) so
 * the server can materialize the (color × size) cross-product into
 * the variants table when saving.
 */
export function ItemEditor({ categories, onCreated }: Props) {
  const [articleNumber, setArticleNumber] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [sizes, setSizes] = useState<string[]>([])
  const [sizeDraft, setSizeDraft] = useState("")
  const [colors, setColors] = useState<ColorDraft[]>([])
  const [colorNameDraft, setColorNameDraft] = useState("")
  const [colorHexDraft, setColorHexDraft] = useState("#000000")
  const lastSuggestedName = useRef<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleHexChange(hex: string) {
    setColorHexDraft(hex)
    const suggested = matchPaletteHex(hex).name
    const current = colorNameDraft.trim()
    if (current === "" || current === lastSuggestedName.current) {
      setColorNameDraft(suggested)
      lastSuggestedName.current = suggested
    } else {
      lastSuggestedName.current = suggested
    }
  }

  function handleNameChange(value: string) {
    setColorNameDraft(value)
    const tile = CLOTHING_PALETTE.find(
      (t) => t.name.toLowerCase() === value.trim().toLowerCase(),
    )
    if (tile) {
      setColorHexDraft(tile.hex)
      lastSuggestedName.current = tile.name
    }
  }

  function addSizes(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    setSizes((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.includes(p)) next.push(p)
      }
      return next
    })
    setSizeDraft("")
  }

  function addColor() {
    const cn = colorNameDraft.trim()
    if (!cn || colors.some((c) => c.colorName === cn)) return
    if (!/^#[0-9a-fA-F]{6}$/.test(colorHexDraft)) return
    setColors([...colors, { colorName: cn, colorHex: colorHexDraft }])
    setColorNameDraft("")
  }

  async function save() {
    setSubmitting(true)
    setError(null)
    try {
      const created = await createItem({
        data: {
          articleNumber,
          name,
          description: description || undefined,
          category: category.trim(),
          sizes,
          colors,
        },
      })
      onCreated(created.id, created.articleNumber)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create item.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Article number</label>
        <Input
          className="h-11 text-base"
          value={articleNumber}
          onChange={(e) => setArticleNumber(e.target.value)}
          placeholder="TR-001"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Item name</label>
        <Input
          className="h-11 text-base"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Crew-neck T-shirt"
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Description (optional)</label>
        <Textarea
          className="text-base"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="space-y-1">
        <label className="flex items-center gap-1.5 text-sm font-medium">
          Category
          <InfoTip term="itemForm.category" ariaLabel="What is Category?" />
        </label>
        <CreatableCombobox
          options={categories}
          value={category}
          onChange={setCategory}
          placeholder="Pick or type a category"
          searchPlaceholder="Search categories…"
          emptyMessage="Type to create a new category."
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Sizes</label>
        <Input
          className="h-11 text-base"
          value={sizeDraft}
          onChange={(e) => setSizeDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addSizes(sizeDraft)
            }
          }}
          onBlur={() => {
            if (sizeDraft.trim()) addSizes(sizeDraft)
          }}
          placeholder="Type sizes separated by commas, then Enter"
        />
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sizes.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1">
                {s}
                <button
                  type="button"
                  onClick={() => setSizes(sizes.filter((x) => x !== s))}
                  aria-label={`remove ${s}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {SIZE_QUICK_PICKS.filter((s) => !sizes.includes(s)).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addSizes(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Initial colors (optional)
        </label>
        <p className="text-xs text-muted-foreground">
          Adding colors here materializes a variant for every (color × size)
          combination on save. You can also add colors later from the item
          detail page.
        </p>
        <div className="flex flex-wrap gap-1">
          {colors.map((c) => (
            <Badge
              key={c.colorName}
              variant="secondary"
              className="gap-1"
              style={{ borderColor: c.colorHex }}
            >
              <span
                className="inline-block size-3 rounded-full border"
                style={{ backgroundColor: c.colorHex }}
                aria-hidden
              />
              {c.colorName}
              <button
                type="button"
                onClick={() =>
                  setColors(colors.filter((x) => x.colorName !== c.colorName))
                }
                aria-label={`remove ${c.colorName}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-10 text-sm"
            value={colorNameDraft}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Color name (e.g. Burgundy)"
            list="clothing-palette-names"
          />
          <datalist id="clothing-palette-names">
            {CLOTHING_PALETTE.map((t) => (
              <option key={t.name} value={t.name} />
            ))}
          </datalist>
          <HexColorField
            value={colorHexDraft}
            onChange={handleHexChange}
            ariaLabel="Pick color"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addColor}
            disabled={!colorNameDraft.trim()}
          >
            Add color
          </Button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          onClick={() => void save()}
          disabled={
            !articleNumber || !name || !category.trim() || sizes.length === 0 || submitting
          }
        >
          {submitting ? "Saving…" : "Create item"}
        </Button>
      </div>
    </div>
  )
}
