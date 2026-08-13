import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import BigNumber from 'bignumber.js'
import { z } from 'zod'
import { db } from '#/db'
import {
  supplyRoutes,
  supplyRouteSuppliers,
  storeReceivings,
  suppliers,
} from '#/db/schema'
import { deriveSupplyRouteDisplayStatus } from '#/lib/supply-route-status'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { listSuppliersForSelectQuery } from './supplier-queries'

async function getReceivedLineIds(lineIds: string[]) {
  if (lineIds.length === 0) return new Set<string>()
  const received = await db
    .select({ lineId: storeReceivings.supplyRouteLineId })
    .from(storeReceivings)
    .where(inArray(storeReceivings.supplyRouteLineId, lineIds))
  return new Set(received.map((row) => row.lineId))
}

const positiveRate = z.string().refine((value) => {
  const rate = new BigNumber(value)
  return rate.isFinite() && rate.gt(0)
}, 'Exchange rate must be a positive number')

export const listSupplyRoutes = createServerFn().handler(async () => {
  await requireSessionAndRole(['admin'])

  const routes = await db.query.supplyRoutes.findMany({
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    with: {
      suppliers: {
        with: { supplier: true },
      },
      items: { with: { supplier: true, itemColor: { with: { item: true } } } },
      expenses: true,
    },
  })

  const receivedIds = await getReceivedLineIds(
    routes.flatMap((route) => route.items.map((line) => line.id)),
  )
  return routes.map((route) => ({
    ...route,
    displayStatus:
      route.status === 'received'
        ? 'received'
        : deriveSupplyRouteDisplayStatus({
            totalLineIds: route.items.map((line) => line.id),
            receivedLineIds: new Set(
              route.items
                .filter((line) => receivedIds.has(line.id))
                .map((line) => line.id),
            ),
          }),
  }))
})

export const getSupplyRoute = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, data.id),
      with: {
        suppliers: {
          with: { supplier: true },
        },
        items: {
          with: {
            supplier: true,
            item: true,
            itemColor: { with: { item: true } },
          },
          orderBy: (i, { asc }) => [asc(i.createdAt)],
        },
        expenses: {
          orderBy: (e, { asc }) => [asc(e.createdAt)],
        },
      },
    })

    if (!route) throw new Error('Supply route not found')
    const receivedIds = await getReceivedLineIds(
      route.items.map((line) => line.id),
    )
    return {
      ...route,
      items: route.items.map((line) => ({
        ...line,
        received: receivedIds.has(line.id),
      })),
      displayStatus:
        route.status === 'received'
          ? 'received'
          : deriveSupplyRouteDisplayStatus({
              totalLineIds: route.items.map((line) => line.id),
              receivedLineIds: new Set(
                route.items
                  .filter((line) => receivedIds.has(line.id))
                  .map((line) => line.id),
              ),
            }),
    }
  })

const createRouteInput = z
  .object({
    name: z.string().min(1),
    departureDate: z.string().optional(),
    returnDate: z.string().optional(),
    budgetUsd: z.string().optional(),
    rateUgxPerUsd: positiveRate.optional(),
    rateRmbPerUsd: positiveRate.optional(),
    notes: z.string().optional(),
    supplierIds: z.array(z.uuid()).optional(),
  })
  .refine(
    (d) => !d.departureDate || !d.returnDate || d.departureDate <= d.returnDate,
    {
      message: 'Return date must be on or after departure date',
      path: ['returnDate'],
    },
  )

export const createSupplyRoute = createServerFn()
  .inputValidator(createRouteInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    if (
      data.departureDate &&
      data.returnDate &&
      data.departureDate > data.returnDate
    ) {
      throw new Error('Return date must be on or after departure date')
    }

    const { supplierIds, ...routeData } = data

    return db.transaction(async (tx) => {
      const [route] = await tx
        .insert(supplyRoutes)
        .values(routeData)
        .returning()

      if (supplierIds?.length) {
        await tx.insert(supplyRouteSuppliers).values(
          supplierIds.map((supplierId) => ({
            supplyRouteId: route.id,
            supplierId,
          })),
        )
      }

      return route
    })
  })

const updateRouteInput = z
  .object({
    id: z.uuid(),
    name: z.string().min(1).optional(),
    departureDate: z.string().nullable().optional(),
    returnDate: z.string().nullable().optional(),
    budgetUsd: z.string().nullable().optional(),
    rateUgxPerUsd: positiveRate.nullable().optional(),
    rateRmbPerUsd: positiveRate.nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (d) => !d.departureDate || !d.returnDate || d.departureDate <= d.returnDate,
    {
      message: 'Return date must be on or after departure date',
      path: ['returnDate'],
    },
  )

export const updateSupplyRoute = createServerFn()
  .inputValidator(updateRouteInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const { id, ...fields } = data
    const existing = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, id),
    })
    if (!existing) throw new Error('Supply route not found')
    if (existing.status !== 'open')
      throw new Error('Only open routes can be edited')
    const route = (
      await db
        .update(supplyRoutes)
        .set(fields)
        .where(eq(supplyRoutes.id, id))
        .returning()
    ).at(0)

    if (!route) throw new Error('Supply route not found')
    return route
  })

const addSupplierToRouteInput = z.object({
  supplyRouteId: z.uuid(),
  supplierId: z.uuid(),
})

export const addSupplierToRoute = createServerFn()
  .inputValidator(addSupplierToRouteInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const supplier = await db.query.suppliers.findFirst({
      where: and(
        eq(suppliers.id, data.supplierId),
        isNull(suppliers.deletedAt),
      ),
    })
    if (!supplier) throw new Error('Supplier not found')

    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, data.supplyRouteId),
    })
    if (!route) throw new Error('Supply route not found')
    if (route.status !== 'open')
      throw new Error('Only open routes can be edited')

    const existing = await db.query.supplyRouteSuppliers.findFirst({
      where: and(
        eq(supplyRouteSuppliers.supplyRouteId, data.supplyRouteId),
        eq(supplyRouteSuppliers.supplierId, data.supplierId),
      ),
    })
    if (existing) return existing

    const [link] = await db
      .insert(supplyRouteSuppliers)
      .values(data)
      .returning()

    return link
  })

const removeSupplierFromRouteInput = z.object({
  id: z.uuid(),
})

export const removeSupplierFromRoute = createServerFn()
  .inputValidator(removeSupplierFromRouteInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const link = await db.query.supplyRouteSuppliers.findFirst({
      where: eq(supplyRouteSuppliers.id, data.id),
      with: { supplyRoute: true },
    })
    if (!link) throw new Error('Route supplier link not found')
    if (link.supplyRoute.status !== 'open')
      throw new Error('Only open routes can be edited')

    await db
      .delete(supplyRouteSuppliers)
      .where(eq(supplyRouteSuppliers.id, data.id))
  })

export const listSuppliersForSelect = createServerFn()
  .inputValidator(
    z.object({ includeArchived: z.boolean().optional() }).optional(),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin', 'supervisor'])

    return listSuppliersForSelectQuery(data)
  })
