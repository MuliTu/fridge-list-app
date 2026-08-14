import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { fileURLToPath } from 'node:url'

const firebaseAdminEntry = (subpath: 'app' | 'auth' | 'database' | 'firestore') =>
  fileURLToPath(
    new URL(`./node_modules/firebase-admin/lib/${subpath}/index.js`, import.meta.url)
  )

const googleGaxFallbackEntry = fileURLToPath(
  new URL('./node_modules/google-gax/build/src/fallback.js', import.meta.url)
)

export default defineConfig(({ command }) => ({
  plugins: [
    tanstackStart({
      spa: { enabled: true },
      router: { routeFileIgnorePattern: '\\.test\\.(ts|tsx)$' }
    }),
    tailwindcss(),
    react()
  ],
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
  // firebase-admin's ESM shims default-import its CommonJS implementation. When
  // every SSR dependency is bundled (required by this deployment), Rolldown can
  // otherwise lower that shim to `mod.default.SDK_VERSION` even though the CJS
  // module has no default export. Resolve the public subpaths to their equivalent
  // CJS entries for production builds only. In dev these aliases would make
  // Vite's ESM module runner evaluate raw CommonJS and fail on `exports`.
  resolve: command === 'build' ? {
    alias: [
      { find: /^firebase-admin\/app$/, replacement: firebaseAdminEntry('app') },
      { find: /^firebase-admin\/auth$/, replacement: firebaseAdminEntry('auth') },
      { find: /^firebase-admin\/database$/, replacement: firebaseAdminEntry('database') },
      { find: /^firebase-admin\/firestore$/, replacement: firebaseAdminEntry('firestore') },
      // Receipt images only need Firestore's document CRUD, so the composition
      // root explicitly opts into its HTTP/1.1 transport. Resolve google-gax's
      // full gRPC entry to that matching fallback implementation as well; otherwise
      // bundling the CJS gRPC implementation into an ESM SSR chunk leaves its
      // file-scoped `__dirname` references invalid during prerender evaluation.
      { find: /^google-gax$/, replacement: googleGaxFallbackEntry }
    ]
  } : undefined,
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173
  }
}))
