//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'
import pluginQuery from '@tanstack/eslint-plugin-query'

export default [
  ...tanstackConfig,
  ...pluginQuery.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',

      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // Block client code from importing server-only modules. `src/routes/api/**`
    // are server endpoints (TanStack Start API routes), so they may import the
    // server auth instance directly. UI routes must go through createServerFn.
    files: ['src/components/**/*.{ts,tsx}', 'src/routes/**/*.{ts,tsx}'],
    ignores: ['src/routes/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/*-internals', '**/*-internals.*'],
              message:
                '*-internals modules are server-only (they bypass the createServerFn boundary). Import the corresponding server function instead.',
            },
            {
              group: ['#/db', '#/db/*', '@/db', '@/db/*'],
              message:
                'Direct DB access from client code is forbidden — it pulls pg/drizzle into the client bundle. Use a server function in src/server/functions/ instead.',
            },
            {
              group: ['#/lib/auth', '@/lib/auth'],
              message:
                'Import authClient from #/lib/auth-client; #/lib/auth is the server-only better-auth instance.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      'cypress/**',
      '.worktrees/**',
      'src/routeTree.gen.ts',
    ],
  },
]
