import { cloudflarePool } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/request-access-rate-limiter.integration.test.ts'],
    pool: cloudflarePool({
      main: 'src/server/request-access-rate-limiter-test-worker.ts',
      wrangler: { configPath: './wrangler.test.jsonc' },
    }),
  },
})
