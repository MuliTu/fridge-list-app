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
  //
  // `firebase-admin` (added for ticket F2's retry-feedback route, using only its
  // `app`/`database` subpaths — not `firestore`, so no grpc involved) is
  // force-excluded from that bundling via `external` even though noExternal is
  // otherwise `true`: bundling its transitive dependency tree (google-auth-library,
  // gcp-metadata, the @firebase/* packages it wraps for RTDB access, all written
  // assuming real Node `require` semantics) into one Rollup chunk breaks at runtime
  // with `TypeError: Cannot read properties of undefined (reading 'SDK_VERSION')` —
  // confirmed by hitting this directly during this build. Because it's external,
  // scripts/vercel-build.mjs separately copies firebase-admin's real node_modules
  // subtree (traced via @vercel/nft) alongside the function output, so this doesn't
  // reintroduce the ERR_MODULE_NOT_FOUND problem the comment above describes — see
  // that script for the copy step.
  ssr: command === 'build' ? { noExternal: true, external: ['firebase-admin'] } : undefined,
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
}))
