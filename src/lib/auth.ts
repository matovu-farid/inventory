import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import * as schema from "#/db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://tanstack-start-app.faridmato90.workers.dev",
    "https://inventory.fidexa.org",
  ],
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "sales",
        input: true,
      },
      shopId: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (userData) => {
          // First user in the system becomes admin
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.user)
          const userCount = Number(result[0].count)
          if (userCount === 0) {
            return { data: { ...userData, role: "admin" } }
          }
          // Subsequent users default to sales
          if (!userData.role || userData.role === "user") {
            return { data: { ...userData, role: "sales" } }
          }
          return { data: userData }
        },
      },
    },
  },
  plugins: [tanstackStartCookies(), admin()],
})

export type Session = typeof auth.$Infer.Session
