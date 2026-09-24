# Firebase to RDS Migration Plan

## Objective

Execute the migration described in `docs/architecture/firebase-to-rds-migration-spec.md` by moving primary app data from Firebase Realtime Database to AWS RDS PostgreSQL through Prisma, while keeping Firebase Auth stable for the first release.

## Related Documents

- `docs/architecture/firebase-to-rds-task-checklist.md`
- `docs/architecture/firebase-to-rds-index.md`
- `docs/architecture/firebase-to-rds-milestone-dashboard.md`
- `docs/architecture/firebase-to-rds-discovery-findings.md`
- `docs/architecture/firebase-to-rds-gate-review.md`
- `docs/architecture/firebase-to-rds-adrs.md`
- `docs/architecture/firebase-to-rds-open-decisions.md`
- `docs/architecture/firebase-to-rds-decision-questionnaire.md`
- `docs/architecture/firebase-to-rds-gate-ready-summary.md`
- `docs/architecture/firebase-to-rds-risk-register.md`
- `docs/architecture/firebase-to-rds-signoff-record.md`
- `docs/architecture/firebase-to-rds-feature-flags.md`
- `docs/architecture/firebase-to-rds-pr-breakdown.md`
- `docs/architecture/aws-rds-infrastructure-checklist.md`
- `docs/architecture/firebase-export-backup-procedure.md`
- `docs/architecture/firebase-to-rds-staging-rehearsal.md`
- `docs/architecture/firebase-to-rds-production-cutover-runbook.md`
- `docs/architecture/firebase-to-rds-rollback-runbook.md`
- `docs/architecture/firebase-to-rds-communication-plan.md`
- `docs/architecture/firebase-to-rds-production-safety-validation.md`

## Working Principles

- Migrate by vertical slices, not by rewriting the whole app at once.
- Keep RDS access server-only.
- Keep Firebase Realtime Database available until production verification and rollback windows are complete.
- Preserve user-facing behavior before removing old infrastructure.
- Put authorization at the server boundary for every migrated read and write.
- Treat migration scripts and verification reports as production code.

## Milestone 0: Decisions and Readiness

Purpose: remove unknowns before implementation starts.

Tasks:

- Confirm RDS PostgreSQL as the database engine.
- Choose the serverless connection strategy: RDS Proxy, Prisma Accelerate, PgBouncer-compatible pooling, or another approved option.
- Choose the first realtime replacement strategy: explicit refetch, short polling, SSE, WebSockets, or managed pub/sub.
- Decide whether Firestore image storage remains for phase 1.
- Choose the generated ID strategy for new records.
- Decide rollback window length.
- Decide whether production cutover requires a write freeze or dual-write.

Deliverables:

- Filled decision log in this plan.
- Non-production RDS instance.
- `DATABASE_URL` configured in local/staging server environment.
- Prisma validation and migration run against non-production RDS.

Exit criteria:

- No blocking architecture decision remains for the first grocery slice.
- Prisma can connect to RDS outside production.
- The team knows how production migrations will be run.

## Milestone 1: Data and Dependency Inventory

Purpose: know exactly what Firebase usage exists before replacing it.

Tasks:

- Inventory all `firebase/database` imports and each `onValue` subscription.
- Inventory all browser writes in `src/lib/firebase.ts`.
- Inventory all Firebase Admin and Firebase REST repositories under `src/modules`.
- Map each Firebase path to the existing Prisma model or mark a schema gap.
- Review `database.rules.json` and translate each access rule into server authorization requirements.
- Identify user-visible flows that depend on realtime updates.

Deliverables:

- Firebase usage inventory.
- Authorization rule mapping.
- Schema gap list.
- Realtime dependency list.

Exit criteria:

- Every Firebase Realtime Database path is classified as keep, replace, defer, or remove.
- Every schema gap has an owner decision.

## Milestone 2: Prisma Infrastructure Foundation

Purpose: add the safe server-only database foundation.

Tasks:

- Add a server-only Prisma client helper.
- Ensure Prisma client generation works in the current build/deploy flow.
- Add RDS environment validation to the server composition boundary.
- Add a list authorization repository backed by RDS.
- Add tests for configuration failure, connection construction, and authorization behavior.
- Update architecture checks if needed so Prisma stays server-only.

Deliverables:

- Prisma client construction module.
- RDS-backed list authorization repository.
- Tests proving server-only construction and authorization behavior.

Exit criteria:

- Application code can depend on RDS through ports, not direct Prisma imports.
- Client-capable files cannot import Prisma or RDS helpers.

## Milestone 3: First Vertical Slice - Groceries

Purpose: prove the migration pattern on the app's central workflow.

Tasks:

- Implement a Prisma grocery repository matching the existing grocery application port.
- Add or extend server APIs for grocery reads and writes.
- Move grocery browser writes away from direct Firebase calls.
- Add server-backed grocery reads for the staged RDS path.
- Preserve add, update, buy/unbuy, category change, details update, bulk add, and delete behavior.
- Implement refresh behavior after mutations.
- Keep the Firebase path available for rollback.

Deliverables:

- RDS-backed grocery workflow in staging.
- Tests for authorized grocery read/write behavior.
- UI tests for the migrated grocery path.
- Notes on any behavior differences from Firebase.

Exit criteria:

- Grocery workflow can run without Firebase Realtime Database in staging.
- Unauthorized users cannot read or mutate another list.
- Existing Firebase Auth sign-in still works.

## Milestone 4: Migration Tooling

Purpose: make data movement repeatable and verifiable.

Tasks:

- Define Firebase export format and storage location.
- Build import scripts for household lists, members, invites, config, groceries, categories, stock, receipts, receipt line items, and purchase history.
- Add fixture-based tests for migration transforms.
- Add idempotency behavior so rerunning imports is safe.
- Add verification commands for counts, required fields, orphan rows, and key relationships.
- Produce a staging migration report from real or representative export data.

Deliverables:

- Firebase export/import scripts.
- Transform tests.
- Verification script and report format.
- Staging migration report.

Exit criteria:

- A clean staging RDS can be rebuilt from Firebase export.
- Migration differences are visible and classified.

## Milestone 5: Remaining Product Domains

Purpose: migrate all primary app data paths after the grocery pattern is proven.

Recommended order:

1. Categories.
2. Stock.
3. Lists, members, invites, and user config.
4. Receipts and receipt line items.
5. Purchase history and purchase insights.
6. Feedback and retry records if in scope.
7. n8n machine writes.

Tasks per domain:

- Implement Prisma repository.
- Wire repository through server composition.
- Add or update server APIs.
- Replace direct browser Firebase reads/writes.
- Add authorization tests.
- Add persistence tests.
- Update migration transform and verification checks.
- Document any behavior difference.

Deliverables:

- RDS-backed implementation for each domain.
- Passing domain tests.
- Updated migration tooling.
- Updated realtime/refetch behavior.

Exit criteria:

- Normal staging app usage no longer requires Firebase Realtime Database.
- Firebase Auth remains the only required Firebase service for normal staged app usage, except deferred Firestore image storage if still in use.

## Milestone 6: Production Cutover Preparation

Purpose: make cutover operationally boring.

Tasks:

- Create production RDS instance and configure backups, point-in-time recovery, monitoring, and alarms.
- Configure production `DATABASE_URL` and secrets.
- Run final pre-cutover staging migration using recent production export.
- Run full verification and E2E smoke tests.
- Confirm rollback deployment is available.
- Prepare cutover checklist.
- Prepare user/admin communication if a write freeze is needed.

Deliverables:

- Production RDS ready.
- Cutover checklist.
- Rollback checklist.
- Latest migration report.
- Test evidence.

Exit criteria:

- Go/no-go meeting can happen with clear evidence.
- Rollback path is tested or explicitly accepted.

## Milestone 7: Production Cutover

Purpose: switch production data authority to RDS.

Tasks:

- Start write freeze or dual-write window if required.
- Export Firebase production data.
- Run final import into production RDS.
- Run verification checks.
- Switch feature flags or deployment configuration to RDS-backed paths.
- Run smoke tests.
- Monitor errors, auth denials, DB connections, query latency, and key product flows.
- Decide whether to end write freeze.

Deliverables:

- Production running on RDS.
- Cutover log with timestamps and verification output.
- Initial monitoring summary.

Exit criteria:

- App is usable in production through RDS-backed flows.
- No blocking data integrity or authorization issue is open.
- Rollback window starts.

## Milestone 8: Stabilization and Cleanup

Purpose: remove old database paths only after confidence is earned.

Tasks:

- Monitor production through the agreed rollback window.
- Fix performance, query, and UX issues found after cutover.
- Remove Firebase Realtime Database write paths.
- Remove unused Firebase Admin database repositories.
- Remove obsolete env vars.
- Retire Firebase database rules tests if no longer relevant.
- Update README and architecture docs.
- Keep Firebase Auth code.

Deliverables:

- Cleanup PR.
- Updated docs.
- Final migration closure note.

Exit criteria:

- Firebase Realtime Database is no longer in the active primary data path.
- No migration feature flags or fallback code remain unless intentionally documented.

## Ticket Breakdown

Use these as backlog items.

### Planning

- `RDS-001`: Confirm migration decisions and update plan decision log.
- `RDS-002`: Inventory Firebase Realtime Database usage.
- `RDS-003`: Inventory realtime subscriptions and replacement strategy.
- `RDS-004`: Translate Firebase database rules into server authorization requirements.
- `RDS-005`: Review Prisma schema against Firebase data shape.

### Infrastructure

- `RDS-010`: Provision staging RDS PostgreSQL.
- `RDS-011`: Decide and configure connection pooling.
- `RDS-012`: Add server-only Prisma client helper.
- `RDS-013`: Add RDS environment validation.
- `RDS-014`: Add architecture guardrails for Prisma imports.

### Authorization

- `RDS-020`: Implement RDS list authorization repository.
- `RDS-021`: Add authorization tests for owner/member/unauthorized access.
- `RDS-022`: Add owner-only authorization checks for member and invite actions.

### Groceries

- `RDS-030`: Implement Prisma grocery repository.
- `RDS-031`: Add grocery read API.
- `RDS-032`: Move grocery writes to authenticated server APIs.
- `RDS-033`: Replace grocery Firebase subscription in staged RDS path.
- `RDS-034`: Add grocery UI/API/persistence tests.

### Migration Tooling

- `RDS-040`: Define backup/export storage policy.
- `RDS-041`: Create Firebase export procedure.
- `RDS-042`: Build migration fixture format.
- `RDS-043`: Implement transform for lists, members, invites, config, and identity bindings.
- `RDS-044`: Implement transform for groceries, categories, stock, and purchase history.
- `RDS-045`: Implement transform for receipts, receipt line items, whats-new, and feedback.
- `RDS-046`: Build verification report.

### Remaining Domains

- `RDS-050`: Migrate categories.
- `RDS-051`: Migrate stock.
- `RDS-052`: Migrate list membership and invites.
- `RDS-053`: Migrate user config.
- `RDS-054`: Migrate receipts.
- `RDS-055`: Migrate purchase history and purchase insights.
- `RDS-056`: Migrate whats-new.
- `RDS-057`: Migrate feedback and retry records.
- `RDS-058`: Migrate n8n machine grocery writes.

### Cutover

- `RDS-070`: Provision production RDS and monitoring.
- `RDS-071`: Run staging cutover rehearsal.
- `RDS-072`: Prepare production cutover checklist.
- `RDS-073`: Execute production cutover.
- `RDS-074`: Monitor rollback window.
- `RDS-075`: Remove Firebase Realtime Database code after stabilization.

## Decision Log

| Decision | Status | Owner | Notes |
| --- | --- | --- | --- |
| RDS engine | Accepted | Product/engineering | AWS RDS PostgreSQL. |
| Connection pooling | Accepted | Engineering/platform | RDS Proxy recommended; must be implemented before production RDS traffic. |
| Realtime replacement | Accepted | Product/engineering | Start with explicit refetch after mutations plus short polling for shared list screens. Escalate to SSE/WebSockets only if product testing shows refresh lag is unacceptable. |
| Image storage | Accepted | Product/engineering | Keep Firestore image storage out of phase 1 unless separately approved; move to S3 later. |
| ID strategy | Accepted | Engineering | Preserve Firebase IDs during backfill where practical; use generated UUIDs for new RDS-only rows after cutover. |
| Backup location | Accepted | Engineering/platform | Save full Firebase export to encrypted, versioned private S3. Concrete bucket/account/region and owner are still required before export. |
| Rollback window | Accepted | Product/engineering | Minimum 7 days after production cutover. |
| Dual-write vs write freeze | Accepted | Product/engineering | Rehearse first; default to short write freeze unless rehearsal requires dual-write. |

## Go/No-Go Checklist

Before production cutover:

- RDS production instance is configured with backups and monitoring.
- Prisma migrations have run successfully in staging and production target.
- Latest Firebase export imports cleanly into staging.
- Verification report has no blocking differences.
- Smoke tests pass against staging RDS.
- Rollback deployment is available.
- Write freeze or dual-write decision is confirmed.
- On-call/monitoring owner is assigned.
- Secrets are configured and not exposed to browser bundles.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Serverless connection exhaustion | Use RDS Proxy, Prisma Accelerate, or approved pooling. |
| Lost realtime behavior | Start with explicit refetch, then add polling/SSE/WebSockets where needed. |
| Authorization regression | Translate Firebase rules into server tests before cutover. |
| Data transform mistakes | Use fixture tests, staging imports, and verification reports. |
| Rollback data divergence | Keep Firebase source of truth until cutover; define replay/write-freeze policy. |
| Image storage scope creep | Keep Firestore images out of phase 1 unless separately approved. |
| Long-running migration scripts | Make imports idempotent and resumable by domain/list. |

## Immediate Next Steps

1. Fill the decision log.
2. Inventory all Firebase Realtime Database reads/writes.
3. Provision staging RDS.
4. Validate and migrate Prisma schema against staging RDS.
5. Implement the grocery RDS vertical slice.
