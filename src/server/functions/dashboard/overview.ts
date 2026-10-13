import { createServerFn } from '@tanstack/react-start'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { getDashboardOverviewQuery } from './overview.server'

export const getDashboardOverview = createServerFn().handler(async () => {
  const session = await requireSessionAndRole(['admin', 'supervisor'])
  return getDashboardOverviewQuery(session.user.role === 'admin')
})
