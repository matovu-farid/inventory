import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { suppliers } from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { listSuppliersQuery } from './supplier-queries'

export const listSuppliers = createServerFn()
  .inputValidator(
    z.object({ includeArchived: z.boolean().optional() }).optional(),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    return listSuppliersQuery(data)
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
        .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
        .returning()
    ).at(0)

    if (!supplier) {
      throw new Error('Supplier not found')
    }

    return supplier
  })

const archiveSupplierInput = z.object({ id: z.uuid() })

export const archiveSupplier = createServerFn()
  .inputValidator(archiveSupplierInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const supplier = (
      await db
        .update(suppliers)
        .set({ deletedAt: new Date() })
        .where(and(eq(suppliers.id, data.id), isNull(suppliers.deletedAt)))
        .returning()
    ).at(0)

    if (!supplier) throw new Error('Supplier not found')
    return supplier
  })

export const restoreSupplier = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    const supplier = (
      await db
        .update(suppliers)
        .set({ deletedAt: null })
        .where(eq(suppliers.id, data.id))
        .returning()
    ).at(0)

    if (!supplier) throw new Error('Supplier not found')
    return supplier
  })
