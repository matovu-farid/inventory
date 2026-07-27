// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { clearAllQueuedSales, getQueuedSales } from '#/lib/offline/idb'
import { submitSaleOfflineAware } from '#/lib/offline/offline-record-sale'

import { recordSale } from '#/server/functions/shop/sales'

// Mock recordSale server function
vi.mock('#/server/functions/shop/sales', () => ({
  recordSale: vi.fn(),
}))
const mockRecordSale = recordSale as unknown as ReturnType<typeof vi.fn>

const sampleInput = {
  shopId: 'shop-test-uuid',
  paymentMethod: 'cash' as const,
  items: [
    {
      itemId: 'item-1',
      quantity: 2,
      unitPriceUgx: '50000',
    },
  ],
}

beforeEach(async () => {
  await clearAllQueuedSales()
  vi.clearAllMocks()
  // Default: online
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('submitSaleOfflineAware', () => {
  it('online + success: saved then deleted, returns mode=online', async () => {
    mockRecordSale.mockResolvedValueOnce({ id: 'server-sale-id' })

    const result = await submitSaleOfflineAware(sampleInput)

    expect(result.ok).toBe(true)
    expect(result.mode).toBe('online')
    if (result.ok && result.mode === 'online') {
      expect(result.saleId).toBe('server-sale-id')
    }

    // IDB should be empty after successful sync
    const queue = await getQueuedSales()
    expect(queue).toHaveLength(0)
  })

  it('online + network failure: stays queued, returns queued ok=true', async () => {
    mockRecordSale.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const result = await submitSaleOfflineAware(sampleInput)

    expect(result.ok).toBe(true)
    expect(result.mode).toBe('queued')

    const queue = await getQueuedSales()
    expect(queue).toHaveLength(1)
    expect(queue[0].status).toBe('queued')
  })

  it('online + business error: marks failed, returns ok=false with reason', async () => {
    mockRecordSale.mockRejectedValueOnce(
      new Error('Insufficient stock for TR-001: have 1, need 5'),
    )

    const result = await submitSaleOfflineAware(sampleInput)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('Insufficient stock')
      expect(result.localId).toBeTruthy()
    }

    const queue = await getQueuedSales()
    expect(queue).toHaveLength(1)
    expect(queue[0].status).toBe('failed')
    expect(queue[0].failureReason).toContain('Insufficient stock')
  })

  it('offline: queued without attempting server, returns queued ok=true', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })

    const result = await submitSaleOfflineAware(sampleInput)

    expect(result.ok).toBe(true)
    expect(result.mode).toBe('queued')
    // recordSale must NOT have been called
    expect(mockRecordSale).not.toHaveBeenCalled()

    const queue = await getQueuedSales()
    expect(queue).toHaveLength(1)
    expect(queue[0].status).toBe('queued')
  })
})
