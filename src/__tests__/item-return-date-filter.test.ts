import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import {
  archiveItemQuery,
  listItemsQuery,
  searchItemsQuery,
} from '#/server/functions/items/items.server'
import { items, suppliers, supplyRouteLines, supplyRoutes } from '#/db/schema'

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const createdItemIds: string[] = []
const createdRouteIds: string[] = []
const createdLineIds: string[] = []
let supplierId = ''
let boundaryItemId = ''
let multiRouteItemId = ''
let outsideItemId = ''
let nullDateItemId = ''
let archivedItemId = ''

async function createItem(articleNumber: string, name: string) {
  const [row] = await db
    .insert(items)
    .values({ articleNumber, name, category: `Filter test ${suffix}` })
    .returning({ id: items.id })
  createdItemIds.push(row.id)
  return row.id
}

async function createRoute(name: string, returnDate: string | null) {
  const [row] = await db
    .insert(supplyRoutes)
    .values({ name, status: 'open', returnDate })
    .returning({ id: supplyRoutes.id })
  createdRouteIds.push(row.id)
  return row.id
}

async function createLine(itemId: string, supplyRouteId: string) {
  const [row] = await db
    .insert(supplyRouteLines)
    .values({
      supplyRouteId,
      supplierId,
      itemId,
      quantity: 1,
      unitPriceForeign: '10.00',
      foreignCurrency: 'RMB',
      totalAmountForeign: '10.00',
      totalCostUgx: '1000.00',
    })
    .returning({ id: supplyRouteLines.id })
  createdLineIds.push(row.id)
}

beforeAll(async () => {
  const [supplier] = await db
    .insert(suppliers)
    .values({
      name: `Return date filter supplier ${suffix}`,
      type: 'international',
    })
    .returning({ id: suppliers.id })
  supplierId = supplier.id

  multiRouteItemId = await createItem(
    `DATE-MULTI-${suffix}`,
    'Multi route item',
  )
  boundaryItemId = await createItem(`DATE-BOUNDARY-${suffix}`, 'Boundary item')
  outsideItemId = await createItem(`DATE-OUTSIDE-${suffix}`, 'Outside item')
  nullDateItemId = await createItem(`DATE-NULL-${suffix}`, 'Null date item')
  archivedItemId = await createItem(`DATE-ARCHIVED-${suffix}`, 'Archived item')

  const lowerRouteId = await createRoute(`Lower ${suffix}`, '2026-01-15')
  const upperRouteId = await createRoute(`Upper ${suffix}`, '2026-01-31')
  const outsideRouteId = await createRoute(`Outside ${suffix}`, '2026-02-01')
  const nullDateRouteId = await createRoute(`Open ${suffix}`, null)

  await createLine(boundaryItemId, lowerRouteId)
  await createLine(multiRouteItemId, lowerRouteId)
  await createLine(multiRouteItemId, upperRouteId)
  await createLine(outsideItemId, outsideRouteId)
  await createLine(nullDateItemId, nullDateRouteId)
  await createLine(archivedItemId, upperRouteId)
  await archiveItemQuery({ id: archivedItemId })
})

afterAll(async () => {
  if (createdLineIds.length > 0) {
    await db
      .delete(supplyRouteLines)
      .where(inArray(supplyRouteLines.id, createdLineIds))
  }
  if (createdRouteIds.length > 0) {
    await db
      .delete(supplyRoutes)
      .where(inArray(supplyRoutes.id, createdRouteIds))
  }
  if (createdItemIds.length > 0) {
    await db.delete(items).where(inArray(items.id, createdItemIds))
  }
  if (supplierId) await db.delete(suppliers).where(eq(suppliers.id, supplierId))
})

describe('item return-date filtering', () => {
  it('returns items on both inclusive boundaries and deduplicates matching lines', async () => {
    const rows = await searchItemsQuery({
      query: suffix,
      returnDateFrom: '2026-01-15',
      returnDateTo: '2026-01-31',
    })
    const ids = rows.map((row) => row.id)

    expect(ids.slice(0, 2)).toEqual([boundaryItemId, multiRouteItemId])
    expect(ids).not.toContain(outsideItemId)
    expect(ids).not.toContain(nullDateItemId)
    expect(ids.filter((id) => id === multiRouteItemId)).toHaveLength(1)
  })

  it('supports one-sided ranges and excludes null return dates', async () => {
    const fromRows = await searchItemsQuery({
      query: suffix,
      returnDateFrom: '2026-01-31',
    })
    const toRows = await searchItemsQuery({
      query: suffix,
      returnDateTo: '2026-01-15',
    })

    expect(fromRows.map((row) => row.id)).toContain(multiRouteItemId)
    expect(fromRows.map((row) => row.id)).not.toContain(archivedItemId)
    expect(fromRows.map((row) => row.id)).not.toContain(boundaryItemId)
    expect(fromRows.map((row) => row.id)).not.toContain(nullDateItemId)
    expect(toRows.map((row) => row.id)).toContain(boundaryItemId)
    expect(toRows.map((row) => row.id)).toContain(multiRouteItemId)
    expect(toRows.map((row) => row.id)).not.toContain(outsideItemId)
    expect(toRows.map((row) => row.id)).not.toContain(nullDateItemId)
  })

  it('composes text search and archive filtering with the date range', async () => {
    const textRows = await searchItemsQuery({
      query: `DATE-MULTI-${suffix}`,
      returnDateFrom: '2026-01-15',
      returnDateTo: '2026-01-31',
    })
    const archivedRows = await searchItemsQuery({
      query: `DATE-ARCHIVED-${suffix}`,
      includeArchived: true,
      returnDateFrom: '2026-01-31',
      returnDateTo: '2026-01-31',
    })

    expect(textRows.map((row) => row.id)).toEqual([multiRouteItemId])
    expect(archivedRows.map((row) => row.id)).toContain(archivedItemId)
  })

  it('keeps date filtering available on the unbounded list query', async () => {
    const rows = await listItemsQuery({
      returnDateFrom: '2026-01-15',
      returnDateTo: '2026-01-15',
    })

    const ours = rows.filter((row) => row.articleNumber.includes(suffix))
    expect(ours.map((row) => row.id)).toEqual([
      boundaryItemId,
      multiRouteItemId,
    ])
  })

  it('rejects reversed and malformed date ranges before querying', async () => {
    await expect(
      searchItemsQuery({
        query: '',
        returnDateFrom: '2026-02-01',
        returnDateTo: '2026-01-31',
      }),
    ).rejects.toThrow('Return date from must be on or before return date to')

    await expect(
      searchItemsQuery({ query: '', returnDateFrom: 'not-a-date' }),
    ).rejects.toThrow()

    await expect(
      searchItemsQuery({ query: '', returnDateFrom: '2026-02-30' }),
    ).rejects.toThrow()
  })

  it('keeps items without a date filter and excludes archived items by default', async () => {
    const rows = await listItemsQuery()
    const ours = rows.filter((row) => row.articleNumber.includes(suffix))
    const ids = ours.map((row) => row.id)

    expect(ids).toContain(nullDateItemId)
    expect(ids).not.toContain(archivedItemId)
  })
})
