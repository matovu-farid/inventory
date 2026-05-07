import { betterAuth, APIError } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import * as schema from "#/db/schema"
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "#/lib/email"

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
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name ?? user.email,
        url,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({
        to: user.email,
        name: user.name ?? user.email,
        url,
      })
    },
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
        before: async (userData, ctx) => {
          const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.user)
          const userCount = Number(result[0].count)

          // Bootstrap: first user becomes admin
          if (userCount === 0) {
            return { data: { ...userData, role: "admin" } }
          }

          // Allow admin-created users (admin plugin path) — these arrive
          // with an active admin session in the request context
          // better-auth ctx shape varies across minor versions; cast intentional
          const headers = (ctx as any)?.context?.request?.headers
          if (headers) {
            try {
              const session = await auth.api.getSession({ headers })
              const role = (session?.user as { role?: string } | undefined)
                ?.role
              if (role === "admin") {
                if (!userData.role || userData.role === "user") {
                  return { data: { ...userData, role: "sales" } }
                }
                return { data: userData }
              }
            } catch {
              // fall through to rejection
            }
          }

          // Block self-signup once an admin exists
          throw new APIError("FORBIDDEN", {
            message:
              "Sign-up is disabled. Ask your administrator for an invite.",
          })
        },
      },
    },
  },
  plugins: [tanstackStartCookies(), admin()],
})

export type Session = typeof auth.$Infer.Session
