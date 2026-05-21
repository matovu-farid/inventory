import { betterAuth, APIError } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin } from "better-auth/plugins"
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access"
import { createAccessControl } from "better-auth/plugins/access"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import * as schema from "#/db/schema"
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "#/lib/email"
import type { Role } from "#/lib/roles"

/**
 * Roles recognised by this application. The admin plugin's API typings derive
 * the accepted `role` literal from the keys of the `roles` map passed below,
 * so `auth.api.createUser`/`setRole` accept these values without casts.
 */
export type AppRole = Role
const ac = createAccessControl(defaultStatements)
// Supervisor/sales are declared with no admin-plugin permissions; they exist
// only so the admin plugin's API typings accept these role strings. We pass an
// empty-actions grant on `user` to satisfy `newRole`'s `Subset<K, ...>` shape.
const supervisorAc = ac.newRole({ user: [] })
const salesAc = ac.newRole({ user: [] })
const appRoles = {
  admin: adminAc,
  supervisor: supervisorAc,
  sales: salesAc,
}

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
        name: user.name,
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
        name: user.name,
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

          // Allow admin-created users (admin plugin path) — the resolved
          // session of the caller is exposed on ctx.context.session.
          const role = ctx?.context.session?.user.role as AppRole | undefined
          if (role === "admin") {
            if (!userData.role || userData.role === "user") {
              return { data: { ...userData, role: "sales" } }
            }
            return { data: userData }
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
  plugins: [
    tanstackStartCookies(),
    admin({
      ac,
      roles: appRoles,
      defaultRole: "sales",
      adminRoles: ["admin"],
    }),
  ],
})

export type Session = typeof auth.$Infer.Session

/**
 * `additionalFields` declared above (`role`, `shopId`) aren't picked up by
 * better-auth's inferred user type, so we widen it here. Server code reads
 * `session.user.role` / `session.user.shopId` directly off `AppSession`.
 */
export type AppUser = Session["user"] & {
  role?: string | null
  shopId?: string | null
}
export type AppSession = Omit<Session, "user"> & { user: AppUser }
