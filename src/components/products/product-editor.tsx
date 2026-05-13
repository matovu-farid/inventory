import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Badge } from "#/components/ui/badge"
import { X } from "lucide-react"
import { createProduct } from "#/server/functions/products/products"

const DEFAULT_SIZE_SUGGESTIONS = ["XS","S","M","L","XL","XXL"]

interface Props { onCreated: (productId: string, articleNumber: string) => void }

export function ProductEditor({ onCreated }: Props) {
  const [articleNumber, setArticleNumber] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [sizes, setSizes] = useState<string[]>(["S","M","L"])
  const [sizeDraft, setSizeDraft] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function addSize(value: string) {
    const v = value.trim()
    if (!v || sizes.includes(v)) return
    setSizes([...sizes, v]); setSizeDraft("")
  }

  async function save() {
    setSubmitting(true)
    try {
      const created = await createProduct({ data: {
        articleNumber, name, description: description || undefined, sizes,
      }})
      onCreated(created.id, created.articleNumber)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Article number</label>
        <Input className="h-11 text-base" value={articleNumber} onChange={(e) => setArticleNumber(e.target.value)} placeholder="TR-001" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Product name</label>
        <Input className="h-11 text-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="Crew-neck T-shirt" />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Description (optional)</label>
        <Textarea className="text-base" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Sizes</label>
        <div className="flex flex-wrap gap-1">
          {sizes.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1">
              {s}
              <button type="button" onClick={() => setSizes(sizes.filter((x) => x !== s))} aria-label={`remove ${s}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-11 text-base"
            value={sizeDraft}
            onChange={(e) => setSizeDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSize(sizeDraft) } }}
            placeholder="Add size and press Enter"
          />
          {DEFAULT_SIZE_SUGGESTIONS.filter((s) => !sizes.includes(s)).slice(0, 4).map((s) => (
            <Button key={s} type="button" size="sm" variant="ghost" onClick={() => addSize(s)}>{s}</Button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={!articleNumber || !name || sizes.length === 0 || submitting}>
          {submitting ? "Saving…" : "Create product"}
        </Button>
      </div>
    </div>
  )
}
