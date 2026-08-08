import { describe, expect, it } from 'vitest'
import {
  canEditSupplyRouteEntry,
  canEditSupplyRouteLine,
  deriveSupplyRouteDisplayStatus,
} from '#/lib/supply-route-status'
import type { ReceiptState } from '#/lib/supply-route-status'

const state = (received: number, total: number): ReceiptState => ({
  receivedLineIds: new Set(
    Array.from({ length: received }, (_, index) => `line-${index}`),
  ),
  totalLineIds: Array.from({ length: total }, (_, index) => `line-${index}`),
})

describe('supply route display status', () => {
  it('derives open when no line has a receipt', () => {
    expect(deriveSupplyRouteDisplayStatus(state(0, 2))).toBe('open')
  })

  it('derives partially received when only some lines have receipts', () => {
    expect(deriveSupplyRouteDisplayStatus(state(1, 2))).toBe(
      'partially_received',
    )
  })

  it('derives received only when every line has a receipt', () => {
    expect(deriveSupplyRouteDisplayStatus(state(2, 2))).toBe('received')
  })
})

describe('supply route line editability', () => {
  it('allows editing only unreceived lines on an open route', () => {
    expect(
      canEditSupplyRouteLine({ routeState: 'open', received: false }),
    ).toBe(true)
    expect(canEditSupplyRouteLine({ routeState: 'open', received: true })).toBe(
      false,
    )
    expect(
      canEditSupplyRouteLine({ routeState: 'received', received: false }),
    ).toBe(false)
  })

  it('rejects editing an entry when any materialized row is received', () => {
    expect(
      canEditSupplyRouteEntry({
        routeState: 'open',
        lineIds: ['row-1', 'row-2'],
        receivedLineIds: new Set(['row-1']),
      }),
    ).toBe(false)
    expect(
      canEditSupplyRouteEntry({
        routeState: 'open',
        lineIds: ['row-1', 'row-2'],
        receivedLineIds: new Set(),
      }),
    ).toBe(true)
  })
})
