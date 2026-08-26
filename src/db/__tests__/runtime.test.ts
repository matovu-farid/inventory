import { afterEach, describe, expect, it } from 'vitest'
import { isCloudflareWorkerRuntime } from '../runtime'

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalWebSocketPair = Object.getOwnPropertyDescriptor(
  globalThis,
  'WebSocketPair',
)

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator)
  } else {
    Reflect.deleteProperty(globalThis, 'navigator')
  }

  if (originalWebSocketPair) {
    Object.defineProperty(globalThis, 'WebSocketPair', originalWebSocketPair)
  } else {
    Reflect.deleteProperty(globalThis, 'WebSocketPair')
  }
})

describe('isCloudflareWorkerRuntime', () => {
  it('recognizes the Workers user agent', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Cloudflare-Workers' },
    })

    expect(isCloudflareWorkerRuntime()).toBe(true)
  })

  it('recognizes the Workers WebSocketPair global', () => {
    Object.defineProperty(globalThis, 'WebSocketPair', {
      configurable: true,
      value: class WebSocketPair {},
    })

    expect(isCloudflareWorkerRuntime()).toBe(true)
  })

  it('does not classify Node as Workers', () => {
    expect(isCloudflareWorkerRuntime()).toBe(false)
  })
})
