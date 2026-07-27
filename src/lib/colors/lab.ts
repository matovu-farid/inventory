export type Rgb = { r: number; g: number; b: number }
export type Lab = { L: number; a: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`invalid hex: ${hex}`)
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function srgbToLinear(v: number): number {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
function linearToSrgb(v: number): number {
  const x = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(x * 255)))
}

const Xn = 0.95047,
  Yn = 1.0,
  Zn = 1.08883
function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116
}
function fInv(t: number): number {
  const t3 = t * t * t
  return t3 > 216 / 24389 ? t3 : ((116 * t - 16) * 27) / 24389
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r),
    g = srgbToLinear(rgb.g),
    b = srgbToLinear(rgb.b)
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const Z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b
  const fx = f(X / Xn),
    fy = f(Y / Yn),
    fz = f(Z / Zn)
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function labToRgb(lab: Lab): Rgb {
  const fy = (lab.L + 16) / 116
  const fx = lab.a / 500 + fy
  const fz = fy - lab.b / 200
  const X = Xn * fInv(fx),
    Y = Yn * fInv(fy),
    Z = Zn * fInv(fz)
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z
  const g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z
  const b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) }
}

export function deltaE76(a: Lab, b: Lab): number {
  const dL = a.L - b.L,
    da = a.a - b.a,
    db = a.b - b.b
  return Math.sqrt(dL * dL + da * da + db * db)
}
