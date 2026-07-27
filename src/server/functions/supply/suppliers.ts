import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { suppliers } from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'

export const listSuppliers = createServerFn().handler(async () => {
  await requireSessionAndRole(['admin'])

  return db.select().from(suppliers).orderBy(suppliers.name)
})

const createSupplierInput = z.object({
  name: z.string().min(1),
  type: z.enum(['local', 'international']),
  country: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export const createSupplier = createServerFn()
  .inputValidator(createSupplierInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const [supplier] = await db.insert(suppliers).values(data).returning()

    return supplier
  })

const updateSupplierInput = z.object({
  id: z.uuid(),
  name: z.string().min(1).optional(),
  type: z.enum(['local', 'international']).optional(),
  country: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

export const updateSupplier = createServerFn()
  .inputValidator(updateSupplierInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const { id, ...fields } = data
    const supplier = (
      await db
        .update(suppliers)
        .set(fields)
        .where(eq(suppliers.id, id))
        .returning()
    ).at(0)

    if (!supplier) {
      throw new Error('Supplier not found')
    }

    return supplier
  })
