import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [tanstackStart(), tailwindcss(), react()],
  // Bundles all npm dependencies (react, @tanstack/*, h3-v2, seroval, ...) directly
  // into dist/server/server.js instead of leaving them as bare imports resolved from
  // node_modules at runtime. Needed for the Vercel deploy (scripts/vercel-build.mjs)
  // — that function ships server.js alone with no node_modules alongside it, so an
  // externalized dependency there fails at runtime with ERR_MODULE_NOT_FOUND
  // (confirmed against a real deployment before this was added).
  ssr: {
    noExternal: true
  },
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
})
