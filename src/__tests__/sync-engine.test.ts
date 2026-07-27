// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import {
  clearAllQueuedSales,
  putQueuedSale,
  getQueuedSales,
} from '#/lib/offline/idb'
import type { QueuedSale } from '#/lib/offline/idb'

import { recordSale } from '#/server/functions/shop/sales'
import { useOnline } from '#/lib/offline/use-online'
import { useSyncEngine, _resetSyncMutex } from '#/lib/offline/sync'

// Mock recordSale server function
vi.mock('#/server/functions/shop/sales', () => ({
  recordSale: vi.fn(),
}))

// Mock useOnline so we control connectivity in tests
vi.mock('#/lib/offline/use-online', () => ({
  useOnline: vi.fn().mockReturnValue(true),
}))

const mockRecordSale = recordSale as unknown as ReturnType<typeof vi.fn>
const mockUseOnline = useOnline as unknown as ReturnType<typeof vi.fn>

function makeSale(overrides: Partial<QueuedSale> = {}): QueuedSale {
  return {
    id: crypto.randomUUID(),
    shopId: 'shop-1',
    createdAt: Date.now(),
    payload: { shopId: 'shop-1', paymentMethod: 'cash', items: [] },
    status: 'queued',
    failureReason: null,
    attemptCount: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  _resetSyncMutex()
  await clearAllQueuedSales()
  vi.clearAllMocks()
  mockUseOnline.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSyncEngine', () => {
  it('drains queue when online — queue empty after successful sync', async () => {
    mockRecordSale.mockResolvedValue({ id: 'srv-1' })
    const sale = makeSale()
    await putQueuedSale(sale)

    const { result } = renderHook(() => useSyncEngine())

    // Wait for the sync engine to drain
    await waitFor(
      async () => {
        const queue = await getQueuedSales()
        expect(queue).toHaveLength(0)
      },
      { timeout: 5_000 },
    )

    await waitFor(() => {
      expect(result.current.queued).toBe(0)
    })
    expect(result.current.failed).toBe(0)
  })

  it('a failed sale stays in queue with status failed', async () => {
    mockRecordSale.mockRejectedValue(new Error('Stock gone'))
    const sale = makeSale()
    await putQueuedSale(sale)

    renderHook(() => useSyncEngine())

    await waitFor(
      async () => {
        const queue = await getQueuedSales()
        expect(queue).toHaveLength(1)
        expect(queue[0].status).toBe('failed')
      },
      { timeout: 5_000 },
    )

    const queue = await getQueuedSales()
    expect(queue[0].failureReason).toContain('Stock gone')
  })

  it("concurrent invocations don't double-process the same sale", async () => {
    // Each call to recordSale resolves after a small delay
    mockRecordSale.mockImplementation(
      () =>
        new Promise<{ id: string }>((res) =>
          setTimeout(() => res({ id: 'srv-ok' }), 10),
        ),
    )
    const sale = makeSale()
    await putQueuedSale(sale)

    // Mount two hooks simultaneously — only one should drain
    renderHook(() => useSyncEngine())
    renderHook(() => useSyncEngine())

    await waitFor(
      async () => {
        const queue = await getQueuedSales()
        expect(queue).toHaveLength(0)
      },
      { timeout: 5_000 },
    )

    // recordSale must have been called exactly once due to mutex
    expect(mockRecordSale).toHaveBeenCalledTimes(1)
  })

  it('does not drain when offline', async () => {
    mockUseOnline.mockReturnValue(false)
    mockRecordSale.mockResolvedValue({ id: 'srv-1' })
    const sale = makeSale()
    await putQueuedSale(sale)

    renderHook(() => useSyncEngine())

    // Give it a moment — sync should NOT have run
    await new Promise((r) => setTimeout(r, 100))
    expect(mockRecordSale).not.toHaveBeenCalled()

    const queue = await getQueuedSales()
    expect(queue).toHaveLength(1)
  })
})
