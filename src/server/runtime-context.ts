import { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestAccessRateLimiter } from './durable-objects/request-access-rate-limiter'

export interface WorkerRuntimeEnv {
  REQUEST_ACCESS_RATE_LIMITER: DurableObjectNamespace<RequestAccessRateLimiter>
}

const workerEnvStorage = new AsyncLocalStorage<WorkerRuntimeEnv>()

export function withWorkerEnv<T>(env: WorkerRuntimeEnv, fn: () => T): T {
  return workerEnvStorage.run(env, fn)
}

export function getWorkerEnv(): WorkerRuntimeEnv {
  const env = workerEnvStorage.getStore()
  if (!env) {
    throw new Error(
      'Worker environment accessed outside a request. Use withWorkerEnv().',
    )
  }
  return env
}
