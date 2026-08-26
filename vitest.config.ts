import { defineConfig } from 'vitest/config'
import type { UserConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()] as UserConfig['plugins'],
  resolve: {
    alias: {
      '#': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    include: [
      'src/__tests__/**/*.test.{ts,tsx}',
      'src/**/__tests__/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    // Many tests touch the shared test Postgres DB and use fixed fixture
    // IDs or truncate-all cleanups (e.g. auth-emails first-signup-becomes-
    // admin). Running test files in parallel causes them to step on each
    // other's rows. Force serial file execution to keep the suite
    // deterministic; per-file describe.concurrent is still available where
    // tests don't touch the DB.
    fileParallelism: false,
  },
})
