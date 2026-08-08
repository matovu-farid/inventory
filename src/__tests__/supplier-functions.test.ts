import { afterAll, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { suppliers } from '#/db/schema'
import {
  archiveSupplier,
  listSuppliers,
  updateSupplier,
} from '#/server/functions/supply/suppliers'
import {
  listSuppliersForSelectQuery,
  listSuppliersQuery,
} from '#/server/functions/supply/supplier-queries'

const TEST_USER_ID = '00000000-0000-0000-0000-0000000000sr'

vi.mock('#/server/middleware/auth', () => ({
  requireSession: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: 'admin' },
    }),
}))
vi.mock('#/server/middleware/rbac', () => ({
  requireRole: () => {},
  hasRole: () => true,
  requireSessionAndRole: () =>
    Promise.resolve({
      user: { id: TEST_USER_ID, role: 'admin' },
    }),
}))

const stubStartContext = {
  getRouter: (() => {
    throw new Error('router not available in tests')
  }) as never,
  request: new Request('http://localhost/test'),
  startOptions: { functionMiddleware: [] },
  contextAfterGlobalMiddlewares: {},
  executedRequestMiddlewares: new Set(),
  handlerType: 'serverFn' as const,
}

function callServerFn<T>(fn: () => Promise<T>): Promise<T> {
  return runWithStartContext(stubStartContext, fn)
}

const createdIds: string[] = []

async function insertSupplier(
  name: string,
  overrides: Partial<typeof suppliers.$inferInsert> = {},
) {
  const [supplier] = await db
    .insert(suppliers)
    .values({ name, type: 'international', ...overrides })
    .returning()
  createdIds.push(supplier.id)
  return supplier
}

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(suppliers).where(eq(suppliers.id, id))
  }
})

describe('supplier server functions', () => {
  it('lists only active suppliers', async () => {
    const active = await insertSupplier(`Active ${Date.now()}`)
    const archived = await insertSupplier(`Archived ${Date.now()}`, {
      deletedAt: new Date(),
    })

    await callServerFn(() => listSuppliers())
    const result = await listSuppliersQuery()
    const selectable = await listSuppliersForSelectQuery()

    expect(result.some((supplier) => supplier.id === active.id)).toBe(true)
    expect(result.some((supplier) => supplier.id === archived.id)).toBe(false)
    expect(selectable.some((supplier) => supplier.id === active.id)).toBe(true)
    expect(selectable.some((supplier) => supplier.id === archived.id)).toBe(
      false,
    )
  })

  it('archives an active supplier without removing its row', async () => {
    const supplier = await insertSupplier(`To archive ${Date.now()}`)

    await callServerFn(() => archiveSupplier({ data: { id: supplier.id } }))

    const stored = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplier.id),
    })
    expect(stored?.deletedAt).toBeInstanceOf(Date)
  })

  it('rejects archiving an unknown or already archived supplier', async () => {
    const archived = await insertSupplier(`Already archived ${Date.now()}`, {
      deletedAt: new Date(),
    })

    await expect(
      callServerFn(() =>
        archiveSupplier({
          data: { id: '00000000-0000-0000-0000-000000000000' },
        }),
      ),
    ).rejects.toThrow('Supplier not found')
    await expect(
      callServerFn(() => archiveSupplier({ data: { id: archived.id } })),
    ).rejects.toThrow('Supplier not found')
  })

  it('updates every editable supplier field', async () => {
    const supplier = await insertSupplier(`Before ${Date.now()}`)

    await callServerFn(() =>
      updateSupplier({
        data: {
          id: supplier.id,
          name: `After ${Date.now()}`,
          type: 'local',
          country: 'Uganda',
          contactName: 'Amina',
          contactPhone: '+256700000000',
          contactEmail: 'amina@example.com',
          address: 'Kampala',
          notes: 'Updated notes',
        },
      }),
    )

    const updated = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplier.id),
    })

    expect(updated).toMatchObject({
      type: 'local',
      country: 'Uganda',
      contactName: 'Amina',
      contactPhone: '+256700000000',
      address: 'Kampala',
      notes: 'Updated notes',
    })
  })

  it('does not update an archived supplier', async () => {
    const supplier = await insertSupplier(`Archived update ${Date.now()}`, {
      deletedAt: new Date(),
    })

    await expect(
      callServerFn(() =>
        updateSupplier({
          data: { id: supplier.id, name: 'Should not change' },
        }),
      ),
    ).rejects.toThrow('Supplier not found')

    const stored = await db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplier.id),
    })
    expect(stored?.name).toBe(supplier.name)
  })
})
