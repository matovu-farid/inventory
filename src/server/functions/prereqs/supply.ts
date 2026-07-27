import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { suppliers } from '#/db/schema'
import { deriveSupplyPrereqs } from '#/lib/prerequisites/derive'

const supplierCountQuery = async () => {
  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(suppliers)
  return row[0]?.count ?? 0
}

export const getSupplyPrereqs = createServerFn().handler(async () => {
  const supplierCount = await supplierCountQuery()
  return deriveSupplyPrereqs({ supplierCount })
})

export const getSupplyRouteDetailPrereqs = createServerFn().handler(
  async () => {
    const supplierCount = await supplierCountQuery()
    return deriveSupplyPrereqs({ supplierCount })
  },
)
