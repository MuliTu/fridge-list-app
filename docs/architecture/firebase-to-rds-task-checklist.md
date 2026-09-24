# Firebase to RDS Migration Task Checklist

This checklist turns the migration spec and plan into executable work. Use the checkboxes to mark progress. Each task includes whether it is synchronous or asynchronous, what can run in parallel, and the code context to inspect before starting.

Related docs:

- `docs/architecture/firebase-to-rds-migration-spec.md`
- `docs/architecture/firebase-to-rds-migration-plan.md`
- `docs/architecture/firebase-to-rds-milestone-dashboard.md`
- `docs/architecture/firebase-to-rds-gate-review.md`
- `docs/architecture/firebase-to-rds-gate-ready-summary.md`
- `docs/architecture/firebase-to-rds-decision-questionnaire.md`
- `docs/architecture/firebase-to-rds-decision-processing.md`
- `docs/architecture/firebase-to-rds-open-decisions.md`
- `docs/architecture/firebase-to-rds-risk-register.md`
- `docs/architecture/firebase-to-rds-signoff-record.md`
- `docs/architecture/firebase-to-rds-adrs.md`
- `docs/architecture/firebase-to-rds-feature-flags.md`
- `docs/architecture/firebase-to-rds-pr-breakdown.md`
- `docs/architecture/aws-rds-infrastructure-checklist.md`
- `docs/architecture/aws-rds-staging-provisioning-runbook.md`
- `docs/architecture/firebase-to-rds-staging-rehearsal.md`
- `docs/architecture/firebase-to-rds-production-cutover-runbook.md`
- `docs/architecture/firebase-to-rds-rollback-runbook.md`
- `docs/architecture/firebase-to-rds-communication-plan.md`
- `docs/architecture/firebase-to-rds-production-safety-validation.md`
- `docs/architecture/firebase-to-rds-review-checklist.md`

## Legend

- `Sync`: must be done in order or requires a shared decision before dependent work starts.
- `Async`: can be done independently once its prerequisites are met.
- `Parallel`: can run at the same time as the listed tasks.
- `Gate`: do not move past this point until the task is complete.

## What Can Start Now

These tasks do not require RDS to be provisioned.

Current safe lane:

- [x] Complete read-only discovery and planning.
- [x] Prepare `GATE-1` and `GATE-2` review packet.
- [x] Prepare three-option decision questionnaire.
- [ ] Accept or revise the recommended decision bundle in `docs/architecture/firebase-to-rds-gate-ready-summary.md`.
- [ ] Assign staging RDS, backup/export, rollback, migration, and monitoring owners.
- [ ] Keep production Firebase as the source of truth until a signed production cutover gate.

- [x] `RDS-001` Sync, Gate: Fill migration decision log.
  - Context: `docs/architecture/firebase-to-rds-migration-plan.md`, Decision Log section.
  - Decide: PostgreSQL confirmation, connection pooling, realtime strategy, image storage, ID strategy, rollback window, write freeze vs dual-write.
  - Output: updated decision log.

- [x] `RDS-002` Async: Inventory Firebase Realtime Database browser reads/writes.
  - Context:
    - `src/lib/firebase.ts:1-4` imports Firebase client SDKs.
    - `src/lib/firebase.ts:273-306` defines user/config/whats-new/feedback refs.
    - `src/lib/firebase.ts:422-428` creates list-scoped refs.
    - `src/lib/firebase.ts:474-865` contains grocery, stock, receipt, category, and purchase history writes.
  - Parallel: `RDS-003`, `RDS-004`, `RDS-040`.
  - Output: table of Firebase path, current function, caller, replacement API/repository, migration status.

- [x] `RDS-003` Async: Inventory realtime subscriptions.
  - Context:
    - `src/hooks/GroceriesFeedContext.tsx:16-77` subscribes to groceries.
    - `src/hooks/ListContext.tsx` subscribes to user/list membership state.
    - `src/hooks/useCategories.ts` subscribes to categories.
    - `src/hooks/usePurchaseInsights.ts` subscribes to purchase history.
    - `src/hooks/useWhatsNew.ts` subscribes to app updates.
    - `src/routes/stock.tsx` subscribes to stock.
    - `src/routes/receipts.tsx` subscribes to receipts.
  - Parallel: `RDS-002`, `RDS-004`.
  - Output: realtime dependency list with proposed replacement: refetch, polling, SSE, WebSocket, or defer.

- [x] `RDS-004` Async: Translate Firebase rules into server authorization requirements.
  - Context:
    - `database.rules.json`
    - `src/modules/groceries/application/listAuthorizationRepository.ts`
    - `src/modules/composition.server.ts:231-253` currently uses fail-closed list authorization for groceries.
    - `src/modules/composition.server.ts:319-341` currently uses fail-closed list authorization for receipts.
  - Parallel: `RDS-002`, `RDS-003`, `RDS-020`.
  - Output: owner/member/invite/machine authorization matrix.

- [x] `RDS-005` Async: Review Prisma schema against Firebase data shape.
  - Context:
    - `prisma/schema.prisma:40-59` household lists.
    - `prisma/schema.prisma:61-109` config, members, invites, identity bindings.
    - `prisma/schema.prisma:111-188` groceries, categories, stock, purchase events.
    - `prisma/schema.prisma:190-220` receipts and receipt line items.
    - `prisma/schema.prisma:222-250` whats-new and feedback records.
  - Parallel: `RDS-002`, `RDS-040`.
  - Output: schema gap list and field mapping decisions.

- [ ] `RDS-040` Async: Define backup/export storage policy before touching production data.
  - Context:
    - Existing Firebase DB source: `VITE_FIREBASE_DATABASE_URL` and `FIREBASE_DATABASE_URL` in `.env.example:5` and `.env.example:11`.
    - Target DB connection: `DATABASE_URL` in `.env.example:15`.
  - Parallel: `RDS-002`, `RDS-005`, AWS provisioning.
  - Output: backup location, retention, encryption, access policy, naming convention.

## Work That Can Run In Parallel

### Parallel Track A: Infrastructure

- [x] `RDS-010` Async: Provision staging RDS PostgreSQL.
  - Depends on: `RDS-001` database engine decision.
  - Parallel: `RDS-002`, `RDS-003`, `RDS-005`, `RDS-040`.
  - Output: staging RDS endpoint, database name, network/security notes.
  - Checklist: `docs/architecture/aws-rds-infrastructure-checklist.md`.
  - Runbook: `docs/architecture/aws-rds-staging-provisioning-runbook.md`.
  - Evidence: encrypted private RDS PostgreSQL instance `fridgelistdb-staging` exists in `eu-central-1`, staging secret `fridge-list/staging/DATABASE_URL` points to it, and Prisma `db push` completed from a temporary AWS-side runner.
  - Note: staging currently uses the built-in `postgres` database with `public` schema; no production data has been imported.

- [ ] `RDS-011` Sync, Gate: Choose and configure connection pooling.
  - Depends on: `RDS-001`, `RDS-010`.
  - Context:
    - `src/modules/composition.server.ts:141-147` caches warm server runtime instances.
    - `prisma/schema.prisma:1-3` generates the Prisma client.
    - `prisma/schema.prisma:6-8` configures PostgreSQL.
  - Blocks: production-like load testing and production cutover.
  - Output: selected pooling approach and staging configuration.
  - Checklist: `docs/architecture/aws-rds-infrastructure-checklist.md`.
  - Note: Prisma `@prisma/adapter-pg` is installed and wired, but RDS Proxy or another production pooling strategy is still not configured.

- [x] `RDS-012` Async: Add server-only Prisma client helper.
  - Depends on: `GATE-1`, `GATE-2`.
  - Context:
    - `src/modules/composition.server.ts:1` uses `@tanstack/react-start/server-only`.
    - `prisma/schema.prisma:1-3` defines generated client output.
    - `prisma/schema.prisma:6-8` defines the PostgreSQL datasource.
    - `docs/architecture/module-boundaries.md` defines server-only boundaries.
  - Parallel: `RDS-020`, `RDS-030` after interface decisions.
  - Output: server-only Prisma helper with lazy validation, injected client factory, and tests.
  - Note: real Prisma driver adapter wiring remains blocked by `RDS-011`.
  - Design: `docs/architecture/rds-foundation-implementation-design.md`.
  - Start packet: `docs/architecture/firebase-to-rds-pr1-start-packet.md`.

- [x] `RDS-013` Async: Add RDS environment validation.
  - Depends on: `GATE-1`, `GATE-2`, `RDS-012`.
  - Context:
    - `src/modules/composition.server.ts:40-51` currently defines server environment without `DATABASE_URL`.
    - `src/modules/composition.server.ts:64-76` has shared required-config validation.
    - `.env.example:15` already documents `DATABASE_URL`.
  - Parallel: `RDS-014`.
  - Output: validated `DATABASE_URL` path with safe errors.
  - Design: `docs/architecture/rds-foundation-implementation-design.md`.
  - Start packet: `docs/architecture/firebase-to-rds-pr1-start-packet.md`.

- [x] `RDS-014` Async: Add architecture guardrail for Prisma imports.
  - Depends on: `GATE-1`, `GATE-2`, `RDS-012`.
  - Context:
    - `scripts/check-architecture.mjs`
    - `scripts/check-architecture.test.mjs`
    - `docs/architecture/module-boundaries.md`
  - Parallel: `RDS-013`.
  - Output: architecture rule preventing client-capable files from importing Prisma/RDS helpers.
  - Design: `docs/architecture/rds-foundation-implementation-design.md`.
  - Start packet: `docs/architecture/firebase-to-rds-pr1-start-packet.md`.

### Parallel Track B: Authorization

- [x] `RDS-020` Async: Implement RDS list authorization repository.
  - Depends on: `RDS-005`, `RDS-012`.
  - Context:
    - `src/modules/groceries/application/listAuthorizationRepository.ts`
    - `src/modules/composition.server.ts:231-253` groceries authorization placeholder.
    - `src/modules/composition.server.ts:319-341` receipts authorization placeholder.
    - `prisma/schema.prisma:40-59` `HouseholdList`.
    - `prisma/schema.prisma:73-99` members and invites.
    - `prisma/schema.prisma:102-109` identity binding.
  - Parallel: repository implementations once contract is settled.
  - Output: repository that confirms a Firebase-authenticated user can access a list.
  - Note: implemented as an unwired RDS adapter; runtime wiring remains gated.
  - Design: `docs/architecture/rds-foundation-implementation-design.md`.

- [x] `RDS-021` Async: Add authorization tests.
  - Depends on: `RDS-020`.
  - Context:
    - `src/modules/groceries/application/groceryCommands.service.test.ts`
    - `src/modules/receipts/application/receiptCommands.service.test.ts`
    - `src/modules/stock/application/stockCommands.service.test.ts`
  - Output: tests for owner access, approved member access, pending/unknown denial, service principal denial, and own-identity checks.
  - Design: `docs/architecture/rds-foundation-implementation-design.md`.

### Parallel Track C: Backup and Migration Tooling

- [ ] `RDS-041` Async: Create Firebase export procedure.
  - Depends on: `RDS-040`.
  - Context:
    - `database.rules.json`
    - `.env.example:5`
    - `.env.example:11`
  - Parallel: `RDS-042`, if fixture data is created manually.
  - Output: documented command/procedure for exporting full Firebase JSON safely.
  - Draft: `docs/architecture/firebase-export-backup-procedure.md`.
  - Note: do not mark complete until backup bucket, IAM, and operator are approved.

- [ ] `RDS-042` Async: Build migration fixture format.
  - Depends on: `RDS-002`, `RDS-005`.
  - Context:
    - `src/lib/firebase.ts:273-306` top-level Firebase nodes.
    - `src/lib/firebase.ts:422-428` list-scoped nodes.
    - `prisma/schema.prisma`
  - Parallel: `RDS-043`, `RDS-044`, `RDS-045`.
  - Output: fixture JSON with users, groceries, stock, categories, receipts, purchase history, whats-new, and feedback.
  - Design: `docs/architecture/migration-fixtures-verification-design.md`.

- [ ] `RDS-043` Async: Implement transform for lists, members, invites, config, and identity bindings.
  - Depends on: `RDS-042`.
  - Context:
    - `src/lib/firebase.ts:350-412` list initialization, invite approval, invite/remove, rename.
    - `prisma/schema.prisma:40-109`
  - Parallel: `RDS-044`, `RDS-045`.
  - Output: idempotent transform and tests.
  - Design: `docs/architecture/migration-fixtures-verification-design.md`.

- [ ] `RDS-044` Async: Implement transform for groceries, categories, stock, purchase history.
  - Depends on: `RDS-042`.
  - Context:
    - `src/lib/firebase.ts:422-428` refs.
    - `src/lib/firebase.ts:474-740` grocery and stock write shapes.
    - `src/lib/firebase.ts:836-865` category write shapes.
    - `prisma/schema.prisma:111-188`
  - Parallel: `RDS-043`, `RDS-045`.
  - Output: idempotent transform and tests.
  - Design: `docs/architecture/migration-fixtures-verification-design.md`.

- [ ] `RDS-045` Async: Implement transform for receipts, receipt line items, whats-new, and feedback.
  - Depends on: `RDS-042`.
  - Context:
    - `src/lib/firebase.ts:299-306` whats-new and feedback refs.
    - `src/lib/firebase.ts:311-343` feedback record shape.
    - `src/lib/firebase.ts:776-834` receipt write and price-history read shape.
    - `prisma/schema.prisma:190-250`
  - Parallel: `RDS-043`, `RDS-044`.
  - Output: idempotent transform and tests.
  - Design: `docs/architecture/migration-fixtures-verification-design.md`.

- [ ] `RDS-046` Async: Build verification report.
  - Depends on: `RDS-043`, `RDS-044`, `RDS-045`.
  - Output: counts, orphan checks, required field checks, sample list comparison, and blocking-difference summary.
  - Design: `docs/architecture/migration-fixtures-verification-design.md`.

## Synchronous Gates

Do these in order. Parallel work can continue around them, but each gate blocks later milestones.

- [x] `GATE-1` Sync: Decision log accepted.
  - Blocks: production-like implementation choices.
  - Requires: `RDS-001`.

- [x] `GATE-2` Sync: Firebase inventory and schema mapping accepted.
  - Blocks: full-domain implementation.
  - Requires: `RDS-002`, `RDS-003`, `RDS-004`, `RDS-005`.

- [ ] `GATE-3` Sync: Staging RDS and Prisma foundation ready.
  - Blocks: RDS-backed application testing.
  - Requires: `RDS-010`, `RDS-011`, `RDS-012`, `RDS-013`.
  - Status: partially ready. `RDS-010`, `RDS-012`, and `RDS-013` are complete; `RDS-011` remains open for connection pooling.

- [ ] `GATE-4` Sync: Authorization repository approved.
  - Blocks: any client cutover to RDS.
  - Requires: `RDS-020`, `RDS-021`.

- [ ] `GATE-5` Sync: Migration tooling can rebuild staging RDS.
  - Blocks: production cutover rehearsal.
  - Requires: `RDS-041`, `RDS-042`, `RDS-043`, `RDS-044`, `RDS-045`, `RDS-046`.

- [ ] `GATE-6` Sync: Staging app works without Firebase Realtime Database for normal flows.
  - Blocks: production cutover.
  - Requires: all selected domain migrations and E2E smoke tests.

## First Implementation Slice: Groceries

Do this first to prove the pattern.

- [x] `RDS-030` Async after `GATE-3`: Implement Prisma grocery repository.
  - Depends on: `RDS-012`, `RDS-020`.
  - Context:
    - `src/modules/groceries/application/groceryWriteRepository.ts`
    - `src/modules/groceries/application/groceryCommands.service.ts`
    - `src/modules/groceries/infrastructure/firebaseAdminGroceryWriteRepository.server.ts`
    - `prisma/schema.prisma:111-135`
  - Parallel: `RDS-031`, `RDS-034`.
  - Output: Prisma implementation matching current write repository contract.
  - Note: implemented and exported, but not wired into production runtime.
  - Design: `docs/architecture/grocery-rds-first-slice-design.md`.

- [x] `RDS-031` Async: Add grocery read service/API.
  - Depends on: `RDS-020`, `RDS-030` interface decisions.
  - Context:
    - Existing write route: `src/routes/api/lists/$listId/groceries.tsx:1-18`.
    - Existing client API: `src/client/api/groceries.ts:36-96`.
    - Current realtime read: `src/hooks/GroceriesFeedContext.tsx:39-67`.
  - Parallel: `RDS-030`.
  - Output: authenticated grocery read service and HTTP handler.
  - Note: server handler, route wiring, and authenticated client read method are implemented. Runtime use is controlled by server data capabilities and the RDS read feature flags.
  - Design: `docs/architecture/grocery-rds-first-slice-design.md`.

- [ ] `RDS-032` Async: Move grocery UI writes to API client.
  - Depends on: `RDS-030`.
  - Context:
    - Current browser write functions: `src/lib/firebase.ts:474-554`, `src/lib/firebase.ts:599-640`, `src/lib/firebase.ts:728-740`.
    - Existing API client: `src/client/api/groceries.ts:75-93`.
    - Active list wiring: `src/hooks/ListContext.tsx`.
  - Parallel: `RDS-031`.
  - Output: add/update/purchased/delete uses server API in the RDS path.
  - Design: `docs/architecture/grocery-rds-first-slice-design.md`.

- [x] `RDS-033` Async: Replace grocery `onValue` in RDS path.
  - Depends on: `RDS-031`.
  - Context:
    - `src/hooks/GroceriesFeedContext.tsx`
    - `src/routes/api/data-capabilities.tsx`
    - `src/client/api/dataCapabilities.ts`
  - Output: refetch/polling/SSE implementation matching the selected realtime decision.
  - Note: RDS path uses authenticated refetch plus refresh-on-focus. Firebase realtime remains the default and fallback path unless server capabilities report `groceries.reads = rds`.
  - Design: `docs/architecture/grocery-rds-first-slice-design.md`.

- [ ] `RDS-034` Async: Add grocery tests.
  - Depends on: `RDS-030`, `RDS-031`, `RDS-032`.
  - Context:
    - `src/modules/groceries/application/groceryCommands.service.test.ts`
    - `src/modules/groceries/infrastructure/groceryHttp.server.test.ts`
    - `src/client/api/groceries.test.ts`
    - `src/components/ShoppingListItemRow.test.tsx`
  - Output: tests for authorized add/update/purchased/delete/read and unauthorized denial.
  - Note: read-path client/feed tests are in place; keep open until write-path and unauthorized cutover tests are complete.
  - Design: `docs/architecture/grocery-rds-first-slice-design.md`.

- [ ] `GATE-GROCERY` Sync: Grocery slice accepted in staging.
  - Requires: `RDS-030`, `RDS-031`, `RDS-032`, `RDS-033`, `RDS-034`.
  - Acceptance:
    - Grocery flow runs on RDS in staging.
    - Firebase Auth still works.
    - Firebase Realtime Database is not required for grocery read/write in the staged path.
    - Rollback path remains available.

## Remaining Domain Tasks

These can run after the grocery pattern is accepted. Categories and stock can usually run in parallel. Receipts should wait until image-storage scope is confirmed.

- [ ] `RDS-050` Async: Migrate categories.
  - Depends on: `GATE-GROCERY`.
  - Context:
    - `src/hooks/useCategories.ts`
    - `src/lib/firebase.ts:836-865`
    - `src/modules/catalog/application/catalogCommands.service.ts`
    - `src/modules/catalog/infrastructure/firebaseAdminCatalogCommandRepository.server.ts`
    - `prisma/schema.prisma:137-153`
  - Parallel: `RDS-051`.

- [ ] `RDS-051` Async: Migrate stock.
  - Depends on: `GATE-GROCERY`.
  - Context:
    - `src/routes/stock.tsx`
    - `src/lib/firebase.ts:557-597`
    - `src/modules/stock/application/stockCommands.service.ts`
    - `src/modules/stock/infrastructure/firebaseAdminStockRepository.server.ts`
    - `prisma/schema.prisma:155-171`
  - Parallel: `RDS-050`.

- [ ] `RDS-052` Sync: Migrate lists, active list selection, members, and invites.
  - Depends on: `RDS-020`, `GATE-GROCERY`.
  - Context:
    - `src/hooks/ListContext.tsx`
    - `src/components/ListPicker.tsx`
    - `src/components/ListMembersModal.tsx`
    - `src/lib/firebase.ts:350-412`
    - `prisma/schema.prisma:40-109`
  - Blocks: complete removal of Firebase Realtime Database.

- [ ] `RDS-053` Async: Migrate user config/preferences.
  - Depends on: `RDS-052` or a confirmed user/list config mapping.
  - Context:
    - `src/hooks/useOnboarding.ts`
    - `src/hooks/BoughtItemsPreferenceContext.tsx`
    - `src/lib/firebase.ts:278-297`
    - `prisma/schema.prisma:61-71`
  - Parallel: `RDS-054` if list identity is stable.

- [ ] `RDS-054` Async: Migrate receipts and receipt line items.
  - Depends on: image-storage decision and `RDS-020`.
  - Context:
    - `src/routes/receipts.tsx`
    - `src/lib/firebase.ts:776-834`
    - `src/routes/api/lists/$listId/receipts.tsx`
    - `src/modules/receipts/application/receiptCommands.service.ts`
    - `src/modules/receipts/infrastructure/firebaseAdminReceiptRepository.server.ts`
    - `src/modules/receipts/infrastructure/firebaseAdminReceiptImageRepository.server.ts`
    - `prisma/schema.prisma:190-220`
  - Parallel: `RDS-053`, `RDS-055` after receipt schema is verified.

- [ ] `RDS-055` Async: Migrate purchase history and purchase insights.
  - Depends on: `RDS-030`, `RDS-044`.
  - Context:
    - `src/hooks/usePurchaseInsights.ts`
    - `src/hooks/usePurchaseHabitSummary.ts`
    - `src/lib/firebase.ts:437-472`
    - `src/lib/purchaseInsights.ts`
    - `src/lib/purchaseHabitChanges.ts`
    - `prisma/schema.prisma:173-188`
  - Parallel: `RDS-054`.

- [ ] `RDS-056` Async: Migrate whats-new.
  - Depends on: `RDS-012`.
  - Context:
    - `src/hooks/useWhatsNew.ts`
    - `src/lib/firebase.ts:299-300`
    - `prisma/schema.prisma:222-229`
  - Parallel: feedback migration.

- [ ] `RDS-057` Async: Migrate feedback and retry records.
  - Depends on: `RDS-012`.
  - Context:
    - `src/hooks/useFeedbackToast.ts`
    - `src/lib/firebase.ts:302-343`
    - `src/lib/retryFeedback.ts`
    - `src/routes/api/retry-feedback.tsx`
    - `src/routes/api/submit-feedback.tsx`
    - `prisma/schema.prisma:231-250`
  - Parallel: `RDS-056`.

- [ ] `RDS-058` Async: Migrate n8n machine grocery writes.
  - Depends on: `RDS-030`, `RDS-020`.
  - Context:
    - `src/routes/api/n8n-write-groceries.tsx`
    - `src/modules/groceries/application/persistN8nGrocery.service.ts`
    - `src/modules/groceries/infrastructure/firebaseAdminGroceryWriteRepository.server.ts`
    - `src/modules/integrations/n8n/machineAuthenticator.server.ts`
    - `src/modules/composition.server.ts:209-228`
  - Parallel: later domain work after grocery repository exists.

## Production Cutover Tasks

- [ ] `RDS-070` Sync, Gate: Provision production RDS and backup policy.
  - Depends on: staging success and operations approval.
  - Context: `.env.example:15`, `docs/architecture/firebase-to-rds-migration-spec.md`, backup policy from `RDS-040`.
  - Checklist: `docs/architecture/aws-rds-infrastructure-checklist.md`.

- [ ] `RDS-071` Sync, Gate: Run staging cutover rehearsal.
  - Depends on: `GATE-5`, all selected domain migrations.
  - Output: rehearsal log, import report, smoke test results.
  - Checklist: `docs/architecture/firebase-to-rds-staging-rehearsal.md`.

- [ ] `RDS-072` Sync: Prepare production cutover checklist.
  - Depends on: `RDS-071`.
  - Must include: backup location, export timestamp, import command, verification command, deploy/flag switch, smoke tests, rollback trigger, owner names.
  - Runbook: `docs/architecture/firebase-to-rds-production-cutover-runbook.md`.

- [ ] `RDS-073` Sync, Gate: Execute production cutover.
  - Depends on: `RDS-072`.
  - Steps:
    - Export Firebase.
    - Store encrypted backup.
    - Import to production RDS.
    - Verify.
    - Switch app to RDS path.
    - Smoke test.
    - Start rollback window.
  - Runbook: `docs/architecture/firebase-to-rds-production-cutover-runbook.md`.

- [ ] `RDS-074` Async: Monitor rollback window.
  - Depends on: `RDS-073`.
  - Watch: auth denials, list load failures, DB connections, slow queries, migration mismatches, receipt image failures, n8n write failures.
  - Rollback: `docs/architecture/firebase-to-rds-rollback-runbook.md`.

- [ ] `RDS-075` Sync: Remove Firebase Realtime Database code after rollback window.
  - Depends on: `RDS-074` complete with no rollback.
  - Context:
    - `src/lib/firebase.ts`
    - `src/lib/firebaseAdmin.server.ts`
    - `database.rules.json`
    - `firebase.json`
    - `database-rules.test.ts`
    - `src/modules/**/infrastructure/firebaseAdmin*.server.ts`
  - Keep: Firebase Auth and any explicitly deferred Firestore image storage.

## Recommended Parallel Execution Map

Start immediately:

- [x] `RDS-001`
- [x] `RDS-002`
- [x] `RDS-003`
- [x] `RDS-004`
- [x] `RDS-005`
- [ ] `RDS-040`
- [ ] `RDS-010`

After `GATE-1`/`GATE-2` are signed:

- [ ] `RDS-011`
- [x] `RDS-012`
- [x] `RDS-013`
- [x] `RDS-014`
- [x] `RDS-020`
- [x] `RDS-021`
- [ ] `RDS-041`
- [ ] `RDS-042`

After Prisma and authorization foundation:

- [x] `RDS-030`
- [x] `RDS-031`
- [ ] `RDS-032`
- [x] `RDS-033`
- [ ] `RDS-034`
- [ ] `RDS-043`
- [ ] `RDS-044`
- [ ] `RDS-045`

After grocery slice acceptance:

- [ ] `RDS-050`
- [ ] `RDS-051`
- [ ] `RDS-052`
- [ ] `RDS-053`
- [ ] `RDS-054`
- [ ] `RDS-055`
- [ ] `RDS-056`
- [ ] `RDS-057`
- [ ] `RDS-058`

Production sequence:

- [ ] `RDS-070`
- [ ] `RDS-071`
- [ ] `RDS-072`
- [ ] `RDS-073`
- [ ] `RDS-074`
- [ ] `RDS-075`

## Definition Of Done For Each Task

- [ ] Code or documentation changed is linked in the task notes.
- [ ] Tests or verification commands are listed.
- [ ] Authorization impact is stated.
- [ ] Rollback impact is stated.
- [ ] Any skipped or deferred behavior is explicitly documented.
- [ ] The task checkbox is marked only after review or verification.
