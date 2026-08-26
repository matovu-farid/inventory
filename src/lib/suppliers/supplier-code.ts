import { normalizeArticleNumber } from '#/lib/items/article-number'

const SUPPLIER_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function generateSupplierCode(): string {
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) =>
    SUPPLIER_CODE_ALPHABET.charAt(byte % SUPPLIER_CODE_ALPHABET.length),
  ).join('')
}

export function isSupplierCode(value: string): boolean {
  return /^[A-Z]{8}$/.test(value)
}

export function qualifiedArticleNumber(
  supplierCode: string,
  articleNumber: string,
): string {
  const normalizedCode = supplierCode.trim().toUpperCase()
  if (!isSupplierCode(normalizedCode)) {
    throw new Error('Invalid supplier code')
  }
  return `${normalizedCode}:${normalizeArticleNumber(articleNumber)}`
}
