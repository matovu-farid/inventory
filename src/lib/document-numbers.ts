export type DocumentPrefix =
  | 'SR'
  | 'RCV'
  | 'TRF'
  | 'SALE'
  | 'PAY'
  | 'RET'
  | 'STR-RET'
  | 'STK'

export function formatDocumentNumber(
  prefix: string,
  year: number,
  number: number,
  pad = 4,
): string {
  if (!prefix) throw new Error('document-numbers: prefix required')
  if (year <= 0) throw new Error('document-numbers: year must be positive')
  if (number <= 0) throw new Error('document-numbers: number must be positive')
  if (!Number.isInteger(number))
    throw new Error('document-numbers: number must be an integer')

  return `${prefix}-${year}-${String(number).padStart(pad, '0')}`
}
