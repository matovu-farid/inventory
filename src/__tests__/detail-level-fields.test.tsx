import { describe, expect, it } from 'vitest'
import {
  buildDetailCells,
  getDetailModeOptions,
} from '#/lib/supply/detail-level'

const color = {
  id: 'draft:Black',
  colorName: 'Black',
  colorHex: '#000000',
}

describe('detail-level field rules', () => {
  it('reveals detail modes progressively from draft colors and sizes', () => {
    expect(getDetailModeOptions([], [])).toEqual([
      { value: 'aggregate', label: 'Total only' },
    ])
    expect(getDetailModeOptions([color], [])).toEqual([
      { value: 'aggregate', label: 'Total only' },
      { value: 'colors', label: 'Per color' },
    ])
    expect(getDetailModeOptions([color], ['M'])).toEqual([
      { value: 'aggregate', label: 'Total only' },
      { value: 'colors', label: 'Per color' },
      { value: 'variants', label: 'Per color × size' },
    ])
  })

  it('builds only positive route cells for the active detail mode', () => {
    expect(buildDetailCells('aggregate', '4', {}, {})).toEqual([
      { quantity: 4 },
    ])
    expect(buildDetailCells('colors', '', { 'draft:Black': 3 }, {})).toEqual([
      { itemColorId: 'draft:Black', quantity: 3 },
    ])
    expect(
      buildDetailCells('variants', '', {}, { 'draft:Black|M': 2 }),
    ).toEqual([{ itemColorId: 'draft:Black', size: 'M', quantity: 2 }])
  })
})
