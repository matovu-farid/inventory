// src/server/functions/prereqs/system.ts
import { createServerFn } from '@tanstack/react-start'
import { getTransfersPrereqs } from './transfers'
import { getShopSalesPrereqs, getShopOpeningBalancePrereqs } from './shop'
import { getStorePrereqs } from './store'
import { getSupplyPrereqs, getSupplyRouteDetailPrereqs } from './supply'
import type {
  PrerequisiteResult,
  SystemPrereqsSummary,
  SystemPrereqItem,
} from '#/lib/prerequisites/types'

interface PageCheck {
  pageHref: string
  pageLabel: string
  fn: () => Promise<PrerequisiteResult>
}

// Note: getReceivingPrereqs is intentionally excluded — having no
// in-transit routes is a normal operating state, not a setup gap.
const pageChecks: PageCheck[] = [
  {
    pageHref: '/store/transfers',
    pageLabel: 'Transfers',
    fn: getTransfersPrereqs,
  },
  { pageHref: '/shop/sales', pageLabel: 'Sales', fn: getShopSalesPrereqs },
  {
    pageHref: '/shop/opening-balance',
    pageLabel: 'Shop Opening Balance',
    fn: getShopOpeningBalancePrereqs,
  },
  { pageHref: '/store', pageLabel: 'Stock', fn: getStorePrereqs },
  { pageHref: '/supply', pageLabel: 'Supply Routes', fn: getSupplyPrereqs },
  {
    pageHref: '/supply/$routeId',
    pageLabel: 'Supply Route Details',
    fn: getSupplyRouteDetailPrereqs,
  },
]

// Note: getShopPrereqs is intentionally excluded from system aggregation —
// it depends on a user-selected shop and is not a system-wide concern.

export const getSystemPrereqs = createServerFn().handler(
  async (): Promise<SystemPrereqsSummary> => {
    const results = await Promise.all(
      pageChecks.map(async (check) => ({
        check,
        result: await check.fn(),
      })),
    )

    const items: SystemPrereqItem[] = []
    const satisfiedPages: SystemPrereqsSummary['satisfiedPages'] = []
    let failingHard = 0
    let failingSoft = 0

    for (const { check, result } of results) {
      if (result.satisfied && result.missing.length === 0) {
        satisfiedPages.push({
          pageHref: check.pageHref,
          pageLabel: check.pageLabel,
        })
        continue
      }
      const hasHard = result.missing.some((m) => m.severity === 'hard')
      if (hasHard) failingHard++
      else failingSoft++
      for (const m of result.missing) {
        items.push({
          ...m,
          pageHref: check.pageHref,
          pageLabel: check.pageLabel,
        })
      }
    }

    items.sort((a, b) => {
      if (a.severity === b.severity) return 0
      return a.severity === 'hard' ? -1 : 1
    })

    return {
      totalChecks: pageChecks.length,
      passing: pageChecks.length - failingHard,
      failingHard,
      failingSoft,
      items,
      satisfiedPages,
    }
  },
)
