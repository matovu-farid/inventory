import { describe, expect, it } from 'vitest'
import {
  generateSupplierCode,
  isSupplierCode,
  qualifiedArticleNumber,
} from '../supplier-code'

describe('supplier codes', () => {
  it('generates eight uppercase letters', () => {
    expect(generateSupplierCode()).toMatch(/^[A-Z]{8}$/)
  })

  it('validates the stored code format', () => {
    expect(isSupplierCode('ABCDEFGH')).toBe(true)
    expect(isSupplierCode('abcdefgH')).toBe(false)
    expect(isSupplierCode('ABCDEFG1')).toBe(false)
    expect(isSupplierCode('ABCDEFG')).toBe(false)
    expect(isSupplierCode('ABCDEFGHI')).toBe(false)
  })

  it('qualifies a normalized visible article number', () => {
    expect(qualifiedArticleNumber('abcdefgh', ' jacket 101 ')).toBe(
      'ABCDEFGH:JACKET 101',
    )
  })
})
