import { CLOTHING_PALETTE  } from "./palette"
import type {PaletteColor} from "./palette";
import { deltaE76, hexToRgb, rgbToLab  } from "./lab"
import type {Lab} from "./lab";

const PALETTE_LAB: ReadonlyArray<{ tile: PaletteColor; lab: Lab }> =
  CLOTHING_PALETTE.map((tile) => ({ tile, lab: rgbToLab(hexToRgb(tile.hex)) }))

export function matchPaletteHex(hex: string): PaletteColor {
  return matchPaletteLab(rgbToLab(hexToRgb(hex)))
}

export function matchPaletteLab(lab: Lab): PaletteColor {
  let best = PALETTE_LAB[0]
  let bestD = deltaE76(lab, best.lab)
  for (let i = 1; i < PALETTE_LAB.length; i++) {
    const d = deltaE76(lab, PALETTE_LAB[i].lab)
    if (d < bestD) { bestD = d; best = PALETTE_LAB[i] }
  }
  return best.tile
}
