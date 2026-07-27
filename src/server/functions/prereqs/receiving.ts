import { createServerFn } from '@tanstack/react-start'
import { listReceivableRoutes } from '#/server/functions/store/receiving'
import { deriveReceivingPrereqs } from '#/lib/prerequisites/derive'

export const getReceivingPrereqs = createServerFn().handler(async () => {
  const routes = await listReceivableRoutes()
  return deriveReceivingPrereqs({ receivableRouteCount: routes.length })
})
