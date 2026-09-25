# Context7 Technology Audit for the Target Architecture

Status: Foundation approved
Date: 2026-08-02

## Documentation checked

- TanStack Start (`/websites/tanstack_start_framework_react`)
- Firebase (`/websites/firebase_google`)
- Vite 8.0 (`/vitejs/vite/v8.0.10`)

## Decisions

### Keep

- React and TanStack Start/Router. TanStack documents server routes, composable client/server middleware, environment tree-shaking, and explicit import protection, which fit the thin-adapter modular-monolith design.
- Vite 8. The current Node 22 runtime satisfies Vite's documented Node 22.12+ requirement.
- Firebase Web SDK for browser authentication and temporary read-only realtime projections.
- SPA delivery and current public routes during the migration.

### Add

- Firebase Admin for official server-side `verifyIdToken` and future Admin repository adapters.
- A mandatory authenticated `RequestContext` and principal types.
- A token-verifier port so application code does not import Firebase Admin.
- TanStack `server-only` markers on server infrastructure and composition modules.
- Node engine enforcement, a typecheck command, and architecture dependency checks.

### Change incrementally

- API routes authenticate, parse, call one application service, and map typed results.
- Authorization uses verified Firebase UID plus list membership data.
- Business mutations move from the browser Firebase facade into server application services.
- RTDB browser access becomes read-only for migrated collections.
- n8n sends authenticated intent; grocery policy stays in the monolith.

### Remove after callers migrate

- Custom `jose` Firebase-token verification.
- Direct browser writes to Firebase business collections.
- Provider SDKs, environment reads, and orchestration in route files.
- The multi-domain `src/lib/firebase.ts` facade.
- `scripts/build.mjs` forced termination after import-time Firebase connections are removed.

### Not removed yet

- Manual Vercel packaging. The Context7 result did not establish a safe, version-specific replacement for the current deployment output, so this needs a dedicated deployment spike.
- Existing Firebase paths and record shapes. UID/list-ID bindings are additive until the compatibility migration is complete.
- `jose`. Existing routes continue using it until Firebase Admin credentials and the shared authenticated handler are deployed and verified.

## Foundation slice implemented

- Installed `firebase-admin`.
- Added identity application contracts and Firebase Admin infrastructure.
- Added the authenticated request-context primitives.
- Added a server-only composition root.
- Added an architecture check and unit coverage for authentication behavior.

No route or product behavior changes in this slice.

## Dependency security note

`npm audit --omit=dev` reports 16 production findings: 13 moderate and 3 high. The high findings are in the existing LangChain/PostCSS/brace-expansion dependency graph. The new `firebase-admin` package is associated with a moderate transitive `@google-cloud/storage` finding even though this slice uses only Firebase Auth. npm's proposed automatic remedy is a major downgrade to Firebase Admin 10.3.0, so it was not applied. The adapter remains isolated and is not wired to production routes until credentials and the dependency decision are reviewed.
