/**
 * Client-side image shrink utility.
 *
 * Standard product-photo target: 1600px on the long edge, JPEG quality 0.85.
 * Yields ~200-400KB files for typical phone photos while preserving detail.
 */

export interface ShrinkOptions {
  maxDim?: number
  quality?: number
  mimeType?: "image/jpeg" | "image/webp"
}

const DEFAULT_MAX_DIM = 1600
const DEFAULT_QUALITY = 0.85
const DEFAULT_MIME: ShrinkOptions["mimeType"] = "image/jpeg"

export async function shrinkImage(
  file: Blob,
  opts: ShrinkOptions = {},
): Promise<Blob> {
  const maxDim = opts.maxDim ?? DEFAULT_MAX_DIM
  const quality = opts.quality ?? DEFAULT_QUALITY
  const mimeType = opts.mimeType ?? DEFAULT_MIME

  const img = await loadImage(file)
  const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, maxDim)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  ctx.drawImage(img, 0, 0, w, h)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  )
  if (!blob) throw new Error("Failed to encode shrunk image")
  return blob
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h }
  const ratio = w > h ? max / w : max / h
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}
