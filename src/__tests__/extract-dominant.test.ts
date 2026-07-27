import { describe, it, expect } from 'vitest'
import { extractDominantLab } from '#/lib/colors/extract-dominant'
import { rgbToLab } from '#/lib/colors/lab'

function buildPixels(rgbs: Array<[number, number, number]>) {
  const data = new Uint8ClampedArray(rgbs.length * 4)
  rgbs.forEach(([r, g, b], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return { data, width: rgbs.length, height: 1 }
}

describe('extractDominantLab', () => {
  it('returns the only color in a solid image', () => {
    const pixels = buildPixels(
      Array(64).fill([200, 50, 50]) as Array<[number, number, number]>,
    )
    const lab = extractDominantLab(pixels)
    const expected = rgbToLab({ r: 200, g: 50, b: 50 })
    expect(Math.abs(lab.L - expected.L)).toBeLessThan(3)
    expect(Math.abs(lab.a - expected.a)).toBeLessThan(3)
    expect(Math.abs(lab.b - expected.b)).toBeLessThan(3)
  })

  it('ignores white background and picks the foreground', () => {
    const pixels = buildPixels([
      ...Array(50).fill([253, 253, 253]),
      ...Array(14).fill([123, 31, 43]),
    ] as Array<[number, number, number]>)
    const lab = extractDominantLab(pixels)
    const expected = rgbToLab({ r: 123, g: 31, b: 43 })
    expect(Math.abs(lab.L - expected.L)).toBeLessThan(5)
    expect(Math.abs(lab.a - expected.a)).toBeLessThan(5)
    expect(Math.abs(lab.b - expected.b)).toBeLessThan(5)
  })

  it('falls back to including neutrals when image is all neutral', () => {
    const pixels = buildPixels(
      Array(64).fill([20, 20, 20]) as Array<[number, number, number]>,
    )
    const lab = extractDominantLab(pixels)
    expect(lab.L).toBeLessThan(20)
  })
})
