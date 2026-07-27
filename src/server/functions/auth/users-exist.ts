import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { db } from '#/db'
import { user } from '#/db/schema'

export const usersExist = createServerFn().handler(async () => {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(user)
  return Number(row.count) > 0
})
