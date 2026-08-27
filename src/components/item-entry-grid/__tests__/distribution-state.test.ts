import { describe, expect, it } from 'vitest'
import {
  cloneDistribution,
  distributionSummary,
  distributionTotal,
  validateDistribution,
} from '../distribution-state'
import type { ReceiptQuantityDistribution } from '../distribution-types'

describe('receipt quantity distribution state', () => {
  it('accepts a colour-only allocation whose total equals the row quantity', () => {
    const distribution: ReceiptQuantityDistribution = {
      mode: 'colors',
      cells: [
        { color: 'Red', colorId: 'red-id', quantity: 200 },
        { color: 'Black', colorId: 'black-id', quantity: 300 },
      ],
    }

    expect(validateDistribution(distribution, 500)).toEqual({
      valid: true,
      total: 500,
      difference: 0,
    })
    expect(distributionTotal(distribution)).toBe(500)
    expect(distributionSummary(distribution)).toBe('500 · 2 colours')
  })

  it('rejects a matrix whose total differs from the parent quantity', () => {
    const result = validateDistribution(
      {
        mode: 'variants',
        cells: [{ color: 'Red', size: 'S', quantity: 100 }],
      },
      150,
    )

    expect(result).toMatchObject({ valid: false, total: 100, difference: -50 })
    expect(result.message).toContain('50')
  })

  it('rejects duplicate colour and size cells after normalization', () => {
    const result = validateDistribution(
      {
        mode: 'variants',
        cells: [
          { color: ' Red ', size: 'S', quantity: 2 },
          { color: 'red', size: ' s ', quantity: 3 },
        ],
      },
      5,
    )

    expect(result).toMatchObject({ valid: false, total: 5 })
    expect(result.message).toContain('duplicate')
  })

  it('rejects invalid cells instead of coercing them into a valid total', () => {
    const result = validateDistribution(
      {
        mode: 'colors',
        cells: [
          { color: '', quantity: 2 },
          { color: 'Blue', quantity: -1 },
          { color: 'Green', quantity: 1.5 },
        ],
      },
      2,
    )

    expect(result.valid).toBe(false)
    expect(result.message).toMatch(/colour|quantity/i)
  })

  it('deep-copies allocation cells', () => {
    const source: ReceiptQuantityDistribution = {
      mode: 'variants',
      cells: [
        {
          color: 'Red',
          colorId: 'red-id',
          colorHex: '#ff0000',
          size: 'S',
          quantity: 4,
        },
      ],
    }

    const copy = cloneDistribution(source)
    expect(copy).toEqual(source)
    expect(copy).not.toBe(source)
    expect(copy?.cells).not.toBe(source.cells)
    copy?.cells[0] && (copy.cells[0].quantity = 8)
    expect(source.cells[0].quantity).toBe(4)
  })

  it('summarizes the distribution scope', () => {
    expect(
      distributionSummary({
        mode: 'colors',
        cells: [
          { color: 'Red', quantity: 2 },
          { color: 'Black', quantity: 3 },
        ],
      }),
    ).toBe('5 · 2 colours')
    expect(
      distributionSummary({
        mode: 'variants',
        cells: [
          { color: 'Red', size: 'S', quantity: 2 },
          { color: 'Red', size: 'M', quantity: 3 },
          { color: 'Black', size: 'S', quantity: 4 },
        ],
      }),
    ).toBe('9 · 2 colours × 2 sizes')
  })
})
