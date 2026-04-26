import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth  } from "#/lib/auth"
import type {Session} from "#/lib/auth";

export const getSession = createServerFn().handler(async (): Promise<Session | null> => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  return session
})

export const requireSession = createServerFn().handler(async (): Promise<Session> => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw new Error("Unauthorized")
  }
  return session
})
