import { useRef, useState } from "react"
import { extractDominantLab } from "#/lib/colors/extract-dominant"
import { matchPaletteLab } from "#/lib/colors/match-palette"
import { labToRgb, rgbToHex, rgbToLab, type Rgb } from "#/lib/colors/lab"
import { Button } from "#/components/ui/button"

interface Props {
  initialUrl?: string | null
  onBlobReady: (blob: Blob) => void
  onSuggestColor?: (s: { name: string; hex: string; sampledHex: string }) => void
  onEyedrop?: (s: { name: string; hex: string; sampledHex: string }) => void
}

const MAX_DIM = 1600

export function ImageUploader({ initialUrl, onBlobReady, onSuggestColor, onEyedrop }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl ?? null)

  async function handleFile(file: File) {
    const img = await loadImage(file)
    const canvas = canvasRef.current
    if (!canvas) return
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_DIM)
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(img, 0, 0, w, h)

    const small = downscale(ctx, w, h, 128)
    const lab = extractDominantLab(small)
    const tile = matchPaletteLab(lab)
    const sampledHex = rgbToHex(labToRgb(lab))
    onSuggestColor?.({ name: tile.name, hex: tile.hex, sampledHex })

    canvas.toBlob((blob) => { if (blob) onBlobReady(blob) }, "image/jpeg", 0.82)
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.5))
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onEyedrop) return
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height)
    const ctx = canvas.getContext("2d"); if (!ctx) return
    const data = ctx.getImageData(x, y, 1, 1).data
    const rgb: Rgb = { r: data[0], g: data[1], b: data[2] }
    const lab = rgbToLab(rgb)
    const tile = matchPaletteLab(lab)
    onEyedrop({ name: tile.name, hex: tile.hex, sampledHex: rgbToHex(rgb) })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
        />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
          {previewUrl ? "Replace image" : "Upload image"}
        </Button>
        {previewUrl && <span className="text-xs text-muted-foreground">Click the image to eyedrop</span>}
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="rounded border cursor-crosshair max-h-72 object-contain"
        style={{ display: previewUrl ? "block" : "none" }}
      />
      {!previewUrl && initialUrl && (
        <img src={initialUrl} alt="" className="rounded border max-h-72" />
      )}
    </div>
  )
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h }
  const ratio = w > h ? max / w : max / h
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}
function downscale(ctx: CanvasRenderingContext2D, w: number, h: number, target: number) {
  const tmp = document.createElement("canvas")
  const ratio = Math.min(target / w, target / h, 1)
  tmp.width = Math.max(1, Math.round(w * ratio))
  tmp.height = Math.max(1, Math.round(h * ratio))
  const tctx = tmp.getContext("2d")!
  tctx.drawImage(ctx.canvas, 0, 0, tmp.width, tmp.height)
  return tctx.getImageData(0, 0, tmp.width, tmp.height)
}
