import { AsyncLocalStorage } from 'node:async_hooks'
import '@tanstack/react-start/server-only'
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless'
import { drizzle as drizzleNeonServerless } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import pg from 'pg'

import * as schema from './schema'

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

function isCloudflareWorker(): boolean {
  try {
    require('cloudflare:workers')
    return true
  } catch {
    return false
  }
}

type DbInstance =
  | ReturnType<typeof drizzleNeonServerless<typeof schema>>
  | ReturnType<typeof drizzlePg<typeof schema>>

const requestDbStorage = new AsyncLocalStorage<DbInstance>()

let nodeDbInstance: DbInstance | undefined

function makeNodeDb(): DbInstance {
  const pool = new pg.Pool({ connectionString: getDatabaseUrl() })
  return drizzlePg(pool, { schema })
}

function getDbInstance(): DbInstance {
  const requestDb = requestDbStorage.getStore()
  if (requestDb) return requestDb

  if (isCloudflareWorker()) {
    throw new Error(
      'Database accessed outside a Workers request. All fetch/cron handlers must run inside withRequestDb().',
    )
  }

  if (!nodeDbInstance) {
    nodeDbInstance = makeNodeDb()
  }
  return nodeDbInstance
}

/**
 * Workers: one Neon WebSocket pool per request (supports db.transaction()).
 * Neon docs require pool lifecycle to stay within a single request handler.
 */
export async function withRequestDb<T>(
  fn: () => Promise<T>,
  onCleanup?: (promise: Promise<unknown>) => void,
): Promise<T> {
  neonConfig.webSocketConstructor = WebSocket
  const pool = new NeonPool({ connectionString: getDatabaseUrl() })
  const requestDb = drizzleNeonServerless(pool, { schema })

  try {
    return await requestDbStorage.run(requestDb, fn)
  } finally {
    const close = pool.end().catch(() => {})
    if (onCleanup) {
      onCleanup(close)
    } else {
      await close
    }
  }
}

export type Database = DbInstance

export const db = new Proxy({} as DbInstance, {
  get(_target, prop, receiver) {
    const instance = getDbInstance()
    const value = Reflect.get(instance as object, prop, receiver)
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(instance)
    }
    return value
  },
})

/**
 * In-flight drizzle transaction handle. Derived from the callback parameter
 * of `Database["transaction"]` so it stays in sync with the driver type.
 * Use this in helpers that may run inside a transaction.
 */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Accepts either the top-level `Database` handle or an in-flight `Tx`.
 * Helpers that read inside or outside a transaction should take this.
 */
export type DbOrTx = Database | Tx
