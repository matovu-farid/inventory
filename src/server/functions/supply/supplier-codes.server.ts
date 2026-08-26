import { eq } from 'drizzle-orm'
import type { DbOrTx } from '#/db'
import { supplierCodes } from '#/db/schema'
import {
  generateSupplierCode,
  isSupplierCode,
} from '#/lib/suppliers/supplier-code'

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== 'object') return false
    const record = current as { code?: unknown; cause?: unknown }
    if (record.code === '23505') return true
    current = record.cause
  }
  return false
}

export async function getSupplierCode(
  executor: DbOrTx,
  supplierId: string,
): Promise<string> {
  const row = await executor.query.supplierCodes.findFirst({
    where: eq(supplierCodes.supplierId, supplierId),
  })
  if (!row || !isSupplierCode(row.code)) {
    return ensureSupplierCode(executor, supplierId)
  }
  return row.code
}

/** Create the immutable code when a supplier is first created. */
export async function ensureSupplierCode(
  executor: DbOrTx,
  supplierId: string,
): Promise<string> {
  const existing = await executor.query.supplierCodes.findFirst({
    where: eq(supplierCodes.supplierId, supplierId),
  })
  if (existing) return getSupplierCode(executor, supplierId)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateSupplierCode()
    try {
      await executor.insert(supplierCodes).values({ supplierId, code })
      return code
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const winner = await executor.query.supplierCodes.findFirst({
        where: eq(supplierCodes.supplierId, supplierId),
      })
      if (winner) return getSupplierCode(executor, supplierId)
    }
  }

  throw new Error('Could not allocate a unique supplier code')
}
