/**
 * Detect the Workers runtime without importing the `cloudflare:workers`
 * virtual module. The latter is only available inside workerd and causes
 * Vite's Node-based dev dependency scanner to report a missing dependency.
 */
export function isCloudflareWorkerRuntime(): boolean {
  const workerNavigator = Reflect.get(globalThis, 'navigator') as
    | { userAgent?: string }
    | undefined
  const webSocketPair = Reflect.get(globalThis, 'WebSocketPair')

  return (
    workerNavigator?.userAgent === 'Cloudflare-Workers' ||
    typeof webSocketPair === 'function'
  )
}
