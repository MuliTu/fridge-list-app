import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig(({ command }) => ({
  plugins: [tanstackStart({ spa: { enabled: true } }), tailwindcss(), react()],
  // Bundles all npm dependencies (react, @tanstack/*, h3-v2, seroval, ...) directly
  // into dist/server/server.js instead of leaving them as bare imports resolved from
  // node_modules at runtime. Needed for the Vercel deploy (scripts/vercel-build.mjs)
  // — that function ships server.js alone with no node_modules alongside it, so an
  // externalized dependency there fails at runtime with ERR_MODULE_NOT_FOUND
  // (confirmed against a real deployment before this was added).
  // Build-only: applying this during `vite`/dev (command === 'serve') breaks the dev
  // server outright — its SSR module runner can't load CJS packages like `react`
  // when told not to externalize them ("ReferenceError: module is not defined"),
  // confirmed by hitting this directly while testing an unrelated change.
  ssr: command === 'build' ? { noExternal: true } : undefined,
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
}))
