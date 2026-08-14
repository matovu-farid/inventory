import { extractDominantLab } from '#/lib/colors/extract-dominant'
import { matchPaletteLab } from '#/lib/colors/match-palette'
import { labToRgb, rgbToHex, rgbToLab } from '#/lib/colors/lab'
import type { Rgb } from '#/lib/colors/lab'
import type { ColorSuggestion } from '#/lib/colors/combine-suggestions'

const MAX_DIM = 1600

export interface AnalyzedImage {
  source: Blob
  blob: Blob
  previewUrl: string
  suggestion: ColorSuggestion
  width: number
  height: number
}

export async function analyzeImage(file: Blob): Promise<AnalyzedImage> {
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, MAX_DIM)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, w, h)

  const small = downscale(ctx, w, h, 128)
  const lab = extractDominantLab(small)
  const tile = matchPaletteLab(lab)
  const suggestion: ColorSuggestion = {
    name: tile.name,
    hex: tile.hex,
    sampledHex: rgbToHex(labToRgb(lab)),
  }
  const blob = await canvasToBlob(canvas)
  return {
    source: file,
    blob,
    previewUrl: canvas.toDataURL('image/jpeg', 0.5),
    suggestion,
    width: w,
    height: h,
  }
}

export async function sampleImageAt(
  source: Blob,
  point: { x: number; y: number; width: number; height: number },
): Promise<ColorSuggestion> {
  const img = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0)
  const x = Math.min(
    canvas.width - 1,
    Math.max(0, Math.floor((point.x / point.width) * canvas.width)),
  )
  const y = Math.min(
    canvas.height - 1,
    Math.max(0, Math.floor((point.y / point.height) * canvas.height)),
  )
  const data = ctx.getImageData(x, y, 1, 1).data
  const rgb: Rgb = { r: data[0], g: data[1], b: data[2] }
  const tile = matchPaletteLab(rgbToLab(rgb))
  return { name: tile.name, hex: tile.hex, sampledHex: rgbToHex(rgb) }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (error) => {
      URL.revokeObjectURL(url)
      reject(error)
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to encode image'))
      },
      'image/jpeg',
      0.82,
    )
  })
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { w, h }
  const ratio = w > h ? max / w : max / h
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) }
}

function downscale(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  target: number,
) {
  const tmp = document.createElement('canvas')
  const ratio = Math.min(target / w, target / h, 1)
  tmp.width = Math.max(1, Math.round(w * ratio))
  tmp.height = Math.max(1, Math.round(h * ratio))
  const tctx = tmp.getContext('2d')
  if (!tctx) throw new Error('Canvas 2D context unavailable')
  tctx.drawImage(ctx.canvas, 0, 0, tmp.width, tmp.height)
  return tctx.getImageData(0, 0, tmp.width, tmp.height)
}
