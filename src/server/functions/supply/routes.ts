import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  supplyRoutes,
  supplyRouteSuppliers,
  suppliers,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

export const listSupplyRoutes = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  const routes = await db.query.supplyRoutes.findMany({
    orderBy: (r, { desc }) => [desc(r.createdAt)],
    with: {
      suppliers: {
        with: { supplier: true },
      },
      items: true,
      expenses: true,
    },
  })

  return routes
})

export const getSupplyRoute = createServerFn()
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const route = await db.query.supplyRoutes.findFirst({
      where: eq(supplyRoutes.id, data.id),
      with: {
        suppliers: {
          with: { supplier: true },
        },
        items: {
          with: { supplier: true },
          orderBy: (i, { asc }) => [asc(i.createdAt)],
        },
        expenses: {
          orderBy: (e, { asc }) => [asc(e.createdAt)],
        },
      },
    })

    if (!route) throw new Error("Supply route not found")
    return route
  })

const createRouteInput = z.object({
  name: z.string().min(1),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  budgetUsd: z.string().optional(),
  notes: z.string().optional(),
  supplierIds: z.array(z.string().uuid()).optional(),
})

export const createSupplyRoute = createServerFn()
  .inputValidator(createRouteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

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

const updateRouteInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  status: z
    .enum(["planning", "purchasing", "in_transit", "received", "completed"])
    .optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  budgetUsd: z.string().optional(),
  notes: z.string().optional(),
})

export const updateSupplyRoute = createServerFn()
  .inputValidator(updateRouteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const { id, ...fields } = data
    const route = (await db
      .update(supplyRoutes)
      .set(fields)
      .where(eq(supplyRoutes.id, id))
      .returning()).at(0)

    if (!route) throw new Error("Supply route not found")
    return route
  })

const addSupplierToRouteInput = z.object({
  supplyRouteId: z.string().uuid(),
  supplierId: z.string().uuid(),
})

export const addSupplierToRoute = createServerFn()
  .inputValidator(addSupplierToRouteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const [link] = await db
      .insert(supplyRouteSuppliers)
      .values(data)
      .returning()

    return link
  })

const removeSupplierFromRouteInput = z.object({
  id: z.string().uuid(),
})

export const removeSupplierFromRoute = createServerFn()
  .inputValidator(removeSupplierFromRouteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    await db
      .delete(supplyRouteSuppliers)
      .where(eq(supplyRouteSuppliers.id, data.id))
  })

export const listSuppliersForSelect = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])

  return db
    .select({ id: suppliers.id, name: suppliers.name, type: suppliers.type })
    .from(suppliers)
    .orderBy(suppliers.name)
})
