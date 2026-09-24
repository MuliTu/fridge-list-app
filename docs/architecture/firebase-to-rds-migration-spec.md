# Firebase Realtime Database to AWS RDS Migration Spec

## Summary

Move the application data store from Firebase Realtime Database to AWS RDS PostgreSQL, using Prisma as the relational data access layer. Keep Firebase Auth for the initial migration phase so sign-in, ID tokens, and existing authenticated server routes remain stable while persistence moves behind server-owned APIs.

This is not a connection-string-only change. Firebase Realtime Database currently provides direct browser reads/writes, realtime subscriptions, generated push keys, and database-enforced security rules. RDS must be accessed only from trusted server code, so the migration must also move authorization and write paths to the server.

## Goals

- Store household list data in RDS PostgreSQL through Prisma.
- Preserve current user-facing behavior for lists, groceries, stock, categories, receipts, purchase history, invites, preferences, and feedback flows.
- Keep Firebase Auth as the identity provider for phase 1.
- Replace Firebase Realtime Database security rules with server-side authorization checks.
- Provide a safe migration path with backfill, verification, cutover, rollback, and cleanup phases.
- Keep existing module boundaries: application services depend on ports, infrastructure adapters implement those ports, and server composition constructs concrete adapters.

## Non-Goals

- Replacing Firebase Auth in the first phase.
- Rebuilding the UI or changing product workflows.
- Moving image/blob storage in the same cutover unless explicitly scoped. Firestore image storage can remain temporarily and move to S3 in a separate phase.
- Introducing direct browser access to RDS.
- Performing destructive Firebase cleanup before the rollback window closes.

## Current State

The app currently uses:

- Firebase Auth for Google sign-in and ID tokens.
- Firebase Realtime Database for primary app data.
- Firestore documents for inline image/blob storage.
- Firebase Admin SDK and Firebase REST access for trusted server routes.
- Prisma schema as the intended relational model, but not yet the active primary data path.
- Server module boundaries under `src/modules`.

Important current files:

- `src/lib/firebase.ts`: browser Firebase SDK reads, writes, subscriptions, auth helpers, and Firestore image helpers.
- `src/lib/firebaseAdmin.server.ts`: server-only Firebase Admin database access.
- `database.rules.json`: current Firebase Realtime Database authorization model.
- `prisma/schema.prisma`: PostgreSQL relational model.
- `src/modules/composition.server.ts`: server dependency construction boundary.
- `src/modules/**/infrastructure/firebase*.server.ts`: Firebase-backed server repositories.

## Target State

The target architecture is:

```text
Browser / fridge tablet
  -> React UI
  -> Firebase Auth for sign-in and ID tokens
  -> App server routes for reads and writes
  -> Optional realtime transport owned by the app

Server routes
  -> Firebase token verification
  -> List authorization from RDS
  -> Application services
  -> Prisma repositories

RDS PostgreSQL
  -> Household lists
  -> Members and invites
  -> Groceries, categories, stock, receipts, purchase history
  -> User config and workflow records
```

The browser must not connect to RDS directly. All RDS access must happen through server routes, server actions, or server-only infrastructure adapters.

## Decisions To Confirm

- RDS engine: PostgreSQL is assumed because `prisma/schema.prisma` uses `provider = "postgresql"`.
- Connection strategy for serverless deployment: RDS Proxy, Prisma Accelerate, PgBouncer-compatible pooling, or a non-serverless runtime.
- Realtime replacement strategy: polling, TanStack Query invalidation, Server-Sent Events, WebSockets, or a managed pub/sub layer.
- Image storage path: keep Firestore temporarily, or migrate receipt/item images to S3 with signed URLs.
- ID strategy: `crypto.randomUUID()` or another stable generated ID format for new relational records.
- Rollback window length and whether dual-write is required.

## What To Check

- All imports from `firebase/database`, `firebase/firestore`, `firebase-admin/database`, and Firebase REST repository code.
- Every `onValue` subscription and what UI state depends on it.
- Every direct browser write to groceries, stock, categories, receipts, list membership, invites, config, and feedback.
- Firebase rule behavior in `database.rules.json`, especially owner/member access.
- Existing Prisma schema coverage against real Firebase production data.
- Required indexes for common list queries: by `listId`, `bought`, `category`, `scannedAt`, `purchasedAt`, `member uid`, and invite email.
- n8n machine-write behavior and idempotency.
- Server route auth behavior and error mapping.
- Deployment limits around database connections, cold starts, timeouts, and migrations.
- Backup, restore, monitoring, and secret rotation for RDS.

## What To Mark

Mark each data path before implementation:

- `keep`: Firebase Auth and token verification for phase 1.
- `replace`: Firebase Realtime Database as primary data store.
- `defer`: Firestore image/blob storage, unless image migration is explicitly included.
- `server-only`: Prisma client, RDS credentials, migrations, and all SQL access.
- `authorization-critical`: list membership, owner-only actions, invite management, and machine writes.
- `realtime-dependent`: screens currently relying on `onValue`.
- `migration-required`: data that must be exported from Firebase and transformed into relational rows.
- `compatibility-risk`: flows where old and new code may run at the same time.

## What Should Change

- Add a server-only Prisma client construction boundary.
- Add Prisma-backed repositories for each migrated module.
- Replace Firebase-backed server repositories in server composition.
- Move client-side database writes behind authenticated server APIs.
- Move list reads behind APIs or query loaders.
- Replace Firebase database rules with explicit server authorization checks.
- Replace Firebase push IDs for new data with the chosen RDS ID strategy.
- Convert multi-path Firebase updates into database transactions where the writes must succeed or fail together.
- Update `.env.example`, README, deployment docs, tests, and architecture checks.
- Add migration scripts and verification reports.

## What Should Stay

- Firebase Auth in phase 1.
- Existing product behavior and bilingual UI.
- Existing module boundary rules.
- Existing n8n webhook contracts where possible.
- Existing application services and ports where they already describe the desired behavior.
- Existing test style and error mapping conventions.
- Firebase Realtime Database as rollback source until the migration is verified and the rollback window is closed.

## Data Model Mapping

| Firebase path or concept | RDS target |
| --- | --- |
| `users/{listId}` household/list root | `household_lists` |
| owner UID/email/list name | `household_lists` |
| `users/{listId}/members` | `household_members` |
| `users/{listId}/invites` | `household_invites` |
| `users/{listId}/config` | `user_configs` |
| `users/{listId}/groceries` | `grocery_items` |
| `users/{listId}/categories` | `categories` |
| `users/{listId}/stock` | `stock_items` |
| `users/{listId}/receipts` | `receipts` and `receipt_line_items` |
| `users/{listId}/purchaseHistory` | `purchase_events` |
| Firebase Auth UID/email mapping | `identity_bindings` |
| `feedbacks` | Confirm target table/model before migration |
| Firestore image documents | Keep temporarily or move to S3 |

## Authorization Requirements

Server authorization must preserve the intent of `database.rules.json`.

- Authenticated non-anonymous users may access only lists they own or are approved members of.
- Owner-only actions remain owner-only: invite management, member removal, and owner-scoped list administration.
- Machine writes must require the existing n8n shared secret and allowed-list guard.
- APIs must not trust `listId` alone as proof of authority.
- Responses should not leak private list existence to unauthorized users.
- Authorization checks should live in application ports/repositories, not UI components.

## Realtime Strategy

Firebase `onValue` currently gives automatic synchronization. RDS does not.

Minimum acceptable replacement:

- Reads are server-owned and refresh predictably after mutations.
- UI handles loading, empty, success, permission, and failure states.
- Multiple devices eventually see updates without manual page reload.

Recommended phased approach:

1. Start with API reads plus explicit refetch after mutations.
2. Add short polling or query invalidation for shared list screens if needed.
3. Add SSE/WebSocket/pub-sub only if product usage requires near-instant sync.

## Migration Phases

### Phase 0: Readiness

- Confirm RDS PostgreSQL as target.
- Provision non-production RDS and `DATABASE_URL`.
- Validate `prisma/schema.prisma`.
- Generate Prisma client.
- Decide connection pooling strategy.
- Create seed/test migration environment.

Acceptance criteria:

- Prisma can connect to non-production RDS.
- Schema validates and migrates cleanly.
- Server runtime can open and close database connections safely.

### Phase 1: Repository Foundation

- Add server-only Prisma client helper.
- Implement list authorization repository.
- Implement Prisma repositories for one vertical slice, preferably groceries.
- Keep Firebase implementation available behind composition wiring or feature flags.

Acceptance criteria:

- One slice can read/write RDS through application services.
- Authorization is enforced server-side.
- Tests cover success, unauthorized access, validation failure, and persistence effects.

### Phase 2: Client API Migration

- Replace direct browser writes for the selected slice with authenticated API calls.
- Replace Firebase reads for that slice with server-backed reads.
- Preserve user-visible behavior.
- Define refresh/realtime behavior for that slice.

Acceptance criteria:

- Selected UI workflow works without Firebase Realtime Database access for that domain.
- Browser bundle does not import server-only RDS code.
- Existing Firebase Auth flow still works.

### Phase 3: Backfill and Verification

- Export Firebase data.
- Transform Firebase tree data into relational rows.
- Load into staging RDS.
- Compare record counts, required fields, membership access, receipts, stock, categories, and purchase history.
- Produce a verification report.

Acceptance criteria:

- All required Firebase records map to RDS rows.
- Known production lists can be loaded from RDS.
- Differences are classified as expected, fixed, or blocking.

### Phase 4: Full Domain Migration

Migrate remaining domains:

- Lists and membership.
- Invites and user config.
- Categories.
- Stock.
- Receipts and receipt line items.
- Purchase history.
- Feedback/retry records if in scope.
- n8n machine writes.

Acceptance criteria:

- All primary app data paths use RDS in staging.
- Firebase Realtime Database is no longer required for normal app behavior in staging.
- Test coverage exists at application, API, and persistence boundaries.

### Phase 5: Production Cutover

- Announce write freeze window if needed.
- Run final Firebase export.
- Apply final RDS backfill.
- Run verification.
- Switch production feature flags/configuration.
- Monitor logs, errors, database load, auth failures, and user workflows.

Acceptance criteria:

- Production reads and writes use RDS.
- No critical workflow regressions are observed.
- Rollback path is still available.

### Phase 6: Contract and Cleanup

After the rollback window:

- Remove Firebase Realtime Database write paths.
- Remove unused Firebase admin database repositories.
- Retire database rules tests if no longer needed.
- Keep Firebase Auth code.
- Remove obsolete environment variables.
- Update README and architecture docs.

Acceptance criteria:

- Firebase Realtime Database is not part of the active primary data path.
- Documentation and tests reflect the new architecture.
- No dead migration flags remain.

## Rollback Plan

Before cutover:

- Keep Firebase as source of truth.
- RDS can be rebuilt from Firebase export.

During cutover:

- Keep final Firebase export.
- Keep old Firebase-backed deployment available.
- Avoid irreversible writes to Firebase cleanup paths.

After cutover:

- If RDS path fails early, switch traffic back to Firebase-backed deployment.
- If writes occurred in RDS only, define whether to replay RDS changes back to Firebase or accept a short maintenance window.

Do not delete Firebase data until the rollback window is closed and production verification is complete.

## Testing Requirements

- Prisma schema validation and migration tests.
- Repository tests for CRUD, transactions, constraints, and authorization filters.
- API tests for auth, permission, validation, error mapping, and response shape.
- UI tests for migrated workflows.
- Migration script tests against representative Firebase export fixtures.
- Count and checksum-style verification for backfilled data.
- E2E smoke test for sign-in, active list load, add/update/buy/delete item, stock update, and receipt flow.

Recommended commands:

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm test -- --ci
npm run test:architecture
npm run architecture:check
npm run build
npm run test:e2e
```

## Operational Requirements

- Store `DATABASE_URL` only in server environment variables.
- Use TLS for RDS connections.
- Use connection pooling suitable for the deployment runtime.
- Enable automated backups and point-in-time recovery.
- Add RDS monitoring for CPU, memory, storage, connections, slow queries, and errors.
- Ensure migrations run in a controlled deployment step.
- Never log database credentials, Firebase ID tokens, service-account JSON, or private payloads.

## Open Questions

- Should Firestore image documents move to S3 during this project or later?
- What realtime behavior is required for fridge tablet and mobile multi-device use?
- Is dual-write required during production rollout?
- What is the rollback window?
- Should feedback records be added to Prisma schema before the migration?
- Which environment should own migrations: local CLI, CI, Vercel build step, or a separate release job?
- What RDS size and pooling strategy should be used for expected traffic?

## First Implementation Slice

Start with groceries because it is central, already has module services, and has clear user-visible behavior.

Scope:

- Prisma grocery repository.
- List authorization repository.
- Server read/write APIs for grocery list operations.
- Client adapter replacing direct Firebase grocery writes.
- Migration fixture for grocery items.
- Tests for authorized read/write, unauthorized denial, bought state, category update, and delete.

Exit criteria:

- A household list's grocery workflow can run against RDS in staging with Firebase Auth still enabled.
- Firebase Realtime Database is not used by the grocery workflow in that staged path.
- Rollback to Firebase-backed grocery behavior remains possible until full cutover.
