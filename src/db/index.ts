import "@tanstack/react-start/server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres"
import pg from "pg"

import * as schema from "./schema"

function isNeonUrl(url: string): boolean {
  return /^https?:\/\//.test(url) || /\.neon\.tech/.test(url)
}

function makeDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")

  if (isNeonUrl(url)) {
    const sql = neon(url)
    return drizzleNeon(sql, { schema })
  }

  // Local Postgres / CI: use the standard pg driver
  const pool = new pg.Pool({ connectionString: url })
  return drizzlePg(pool, { schema })
}

export const db = makeDb()
export type Database = typeof db
