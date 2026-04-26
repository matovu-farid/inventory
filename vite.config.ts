import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const isDev = process.env.NODE_ENV !== 'production'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    // Cloudflare Workers runtime breaks node-postgres in dev; enable only for build
    ...(!isDev ? [cloudflare({ viteEnvironment: { name: 'ssr' } })] : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
