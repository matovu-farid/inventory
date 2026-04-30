import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { customers } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

const createCustomerInput = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  notes: z.string().optional(),
})

export const createCustomer = createServerFn()
  .inputValidator(createCustomerInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const [created] = await db
      .insert(customers)
      .values({
        name: data.name,
        phone: data.phone,
        notes: data.notes,
      })
      .returning()
    return created
  })

const updateCustomerInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
})

export const updateCustomer = createServerFn()
  .inputValidator(updateCustomerInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    const { id, ...updates } = data
    const updatedRows = await db
      .update(customers)
      .set(updates)
      .where(eq(customers.id, id))
      .returning()
    if (updatedRows.length === 0) throw new Error(`Customer not found: ${id}`)
    return updatedRows[0]
  })

export const listCustomers = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor", "sales"])

  return db.query.customers.findMany({
    where: isNull(customers.deletedAt),
    orderBy: (c, { asc }) => [asc(c.name)],
  })
})

const getCustomerInput = z.object({ id: z.string().uuid() })

export const getCustomer = createServerFn()
  .inputValidator(getCustomerInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor", "sales"])

    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.id, data.id), isNull(customers.deletedAt)),
    })
    if (!customer) throw new Error(`Customer not found: ${data.id}`)
    return customer
  })

const archiveCustomerInput = z.object({ id: z.string().uuid() })

export const archiveCustomer = createServerFn()
  .inputValidator(archiveCustomerInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    await db
      .update(customers)
      .set({ deletedAt: new Date() })
      .where(eq(customers.id, data.id))
    return { ok: true }
  })
