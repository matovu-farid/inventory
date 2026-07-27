import { rgbToLab } from './lab'
import type { Lab, Rgb } from './lab'

type PixelSource = { data: Uint8ClampedArray; width: number; height: number }

function luma({ r, g, b }: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}
function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function collectLabs(src: PixelSource, includeNeutrals: boolean): Lab[] {
  const out: Lab[] = []
  for (let i = 0; i < src.data.length; i += 4) {
    const rgb: Rgb = { r: src.data[i], g: src.data[i + 1], b: src.data[i + 2] }
    const Y = luma(rgb)
    if (Y < 15 || Y > 240) continue
    if (!includeNeutrals && saturation(rgb) < 0.1) continue
    out.push(rgbToLab(rgb))
  }
  return out
}

export function extractDominantLab(src: PixelSource): Lab {
  let labs = collectLabs(src, false)
  if (labs.length === 0) labs = collectLabs(src, true)
  if (labs.length === 0) return { L: 50, a: 0, b: 0 }

  const BINS = 16
  type Bucket = { count: number; sumL: number; sumA: number; sumB: number }
  const buckets = new Map<number, Bucket>()
  for (const lab of labs) {
    const li = Math.min(BINS - 1, Math.max(0, Math.floor((lab.L / 100) * BINS)))
    const ai = Math.min(
      BINS - 1,
      Math.max(0, Math.floor(((lab.a + 128) / 256) * BINS)),
    )
    const bi = Math.min(
      BINS - 1,
      Math.max(0, Math.floor(((lab.b + 128) / 256) * BINS)),
    )
    const key = li * BINS * BINS + ai * BINS + bi
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { count: 0, sumL: 0, sumA: 0, sumB: 0 }
      buckets.set(key, bucket)
    }
    bucket.count++
    bucket.sumL += lab.L
    bucket.sumA += lab.a
    bucket.sumB += lab.b
  }

  let best: Bucket | undefined
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket
  }
  if (!best) return { L: 50, a: 0, b: 0 }
  return {
    L: best.sumL / best.count,
    a: best.sumA / best.count,
    b: best.sumB / best.count,
  }
}
