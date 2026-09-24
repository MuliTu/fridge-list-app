# Firebase to RDS Workstream Status

Branch: `migrate-to-aws`

Production posture: the app is live in production. Until the cutover gates are complete, migration work must preserve current Firebase-backed production behavior.

## Safety Guardrails

- [ ] Do not change production runtime behavior without a reviewed feature flag or explicit cutover step.
- [ ] Do not delete, disable, or mutate production Firebase data during discovery.
- [ ] Do not remove Firebase Realtime Database paths until the rollback window is closed.
- [ ] Do not expose `DATABASE_URL`, Firebase service account JSON, Firebase ID tokens, or backup files to browser bundles or logs.
- [ ] Keep RDS access server-only.
- [ ] Keep Firebase Auth working throughout phase 1.
- [ ] Every code change must include a rollback note.
- [ ] Every migrated write path must enforce server-side authorization before it can be enabled.
- [ ] Every production cutover step must have a verified backup and smoke test.

## Active Sub-Agents

These are read-only async workstreams. They must not edit files, access production credentials, run network commands, or run destructive commands.

| Task | Agent | Scope | Expected output |
| --- | --- | --- | --- |
| `RDS-002` | Herschel | Firebase Realtime Database browser read/write inventory | Complete; consolidated into `docs/architecture/firebase-to-rds-discovery-findings.md` |
| `RDS-003` | Linnaeus | Realtime dependency inventory | Complete; consolidated into `docs/architecture/firebase-to-rds-discovery-findings.md` |
| `RDS-004` | Chandrasekhar | Authorization mapping | Complete; consolidated into `docs/architecture/firebase-to-rds-discovery-findings.md` |
| `RDS-005` + `RDS-040` | Confucius | Prisma schema gap analysis and backup/export notes | Schema analysis complete; backup/export policy is drafted and still needs bucket/owner decision |

## Sync Gate Progress

- [x] `GATE-1`: Decision log accepted.
  - Status: complete via recommended gate path.
  - Current state: decisions accepted in `docs/architecture/firebase-to-rds-migration-plan.md` and `docs/architecture/firebase-to-rds-gate-review.md`.
  - Remaining safety detail: concrete bucket/account/region and named operators are still required before export/cutover.

- [x] `GATE-2`: Firebase inventory and schema mapping accepted.
  - Status: complete via recommended gate path.
  - Requires: `RDS-002`, `RDS-003`, `RDS-004`, `RDS-005`.

- [ ] `GATE-3`: Staging RDS and Prisma foundation ready.
  - Status: partially ready.
  - Current state: encrypted private staging RDS PostgreSQL exists, staging `DATABASE_URL` is stored server-side in Secrets Manager, and Prisma schema was pushed from an AWS-side temporary runner.
  - Remaining: production connection pooling decision/configuration (`RDS-011`) and gate review.

- [ ] `GATE-4`: Authorization repository approved.
  - Status: ready for review.
  - Requires: authorization mapping plus RDS list authorization implementation.

- [ ] `GATE-5`: Migration tooling can rebuild staging RDS.
  - Status: not started.
  - Requires: export/import scripts and verification report.

- [ ] `GATE-6`: Staging app works without Firebase Realtime Database for normal flows.
  - Status: not started.
  - Requires: migrated domain flows and E2E smoke tests.

## Work Done In This Session

- [x] Created branch `migrate-to-aws`.
- [x] Created migration spec: `docs/architecture/firebase-to-rds-migration-spec.md`.
- [x] Created migration plan: `docs/architecture/firebase-to-rds-migration-plan.md`.
- [x] Created task checklist: `docs/architecture/firebase-to-rds-task-checklist.md`.
- [x] Spawned read-only async agents for `RDS-002`, `RDS-003`, `RDS-004`, `RDS-005`, and `RDS-040`.
- [x] Updated the plan task numbering to match the checklist.
- [x] Added proposed production-safe decision defaults without changing app runtime behavior.
- [x] Consolidated async discovery findings into `docs/architecture/firebase-to-rds-discovery-findings.md`.
- [x] Marked `RDS-002`, `RDS-003`, `RDS-004`, and `RDS-005` complete in the checklist.
- [x] Prepared gate review checklist in `docs/architecture/firebase-to-rds-gate-review.md`.
- [x] Drafted Firebase export and backup procedure in `docs/architecture/firebase-export-backup-procedure.md`.
- [x] Marked `RDS-001` complete as decision log preparation; `GATE-1` remains unsigned.
- [x] Prepared RDS foundation implementation design in `docs/architecture/rds-foundation-implementation-design.md`.
- [x] Prepared grocery first-slice design in `docs/architecture/grocery-rds-first-slice-design.md`.
- [x] Prepared migration fixture and verification design in `docs/architecture/migration-fixtures-verification-design.md`.
- [x] Prepared production safety validation checklist in `docs/architecture/firebase-to-rds-production-safety-validation.md`.
- [x] Prepared proposed ADRs in `docs/architecture/firebase-to-rds-adrs.md`.
- [x] Prepared feature flag matrix in `docs/architecture/firebase-to-rds-feature-flags.md`.
- [x] Prepared PR breakdown in `docs/architecture/firebase-to-rds-pr-breakdown.md`.
- [x] Prepared AWS RDS infrastructure checklist in `docs/architecture/aws-rds-infrastructure-checklist.md`.
- [x] Prepared staging rehearsal checklist in `docs/architecture/firebase-to-rds-staging-rehearsal.md`.
- [x] Prepared production cutover runbook in `docs/architecture/firebase-to-rds-production-cutover-runbook.md`.
- [x] Prepared rollback runbook in `docs/architecture/firebase-to-rds-rollback-runbook.md`.
- [x] Prepared communication plan in `docs/architecture/firebase-to-rds-communication-plan.md`.
- [x] Prepared migration documentation index in `docs/architecture/firebase-to-rds-index.md`.
- [x] Prepared milestone dashboard in `docs/architecture/firebase-to-rds-milestone-dashboard.md`.
- [x] Prepared open decision register in `docs/architecture/firebase-to-rds-open-decisions.md`.
- [x] Prepared risk register in `docs/architecture/firebase-to-rds-risk-register.md`.
- [x] Prepared sign-off record in `docs/architecture/firebase-to-rds-signoff-record.md`.
- [x] Prepared decision questionnaire in `docs/architecture/firebase-to-rds-decision-questionnaire.md`.
- [x] Prepared gate-ready summary in `docs/architecture/firebase-to-rds-gate-ready-summary.md`.
- [x] Accepted `GATE-1` and `GATE-2` via the recommended gate path.
- [x] Implemented PR 1 foundation: server-only Prisma helper, lazy `DATABASE_URL` validation, and Prisma import architecture guardrails.
- [x] Implemented RDS list authorization repository and tests without wiring it into production runtime.
- [x] Installed `@prisma/adapter-pg` and wired the server-only Prisma helper to `PrismaPg`.
- [x] Implemented RDS grocery read/write repositories, read service, and HTTP handler without wiring them into production runtime.
- [x] Provisioned encrypted private staging RDS PostgreSQL instance `fridgelistdb-staging` in `eu-central-1`.
- [x] Stored staging `DATABASE_URL` in AWS Secrets Manager at `fridge-list/staging/DATABASE_URL`.
- [x] Ran Prisma schema validation/generation locally.
- [x] Ran Prisma `db push` from a temporary SSM-managed EC2 runner inside the staging RDS VPC.
- [x] Verified staging DB contains 13 public Prisma tables.
- [x] Terminated the temporary EC2 runner and removed its temporary IAM role/profile.
- [x] Wired authenticated grocery `GET /api/lists/$listId/groceries` to the RDS read service behind `RDS_ENABLED=true` and `RDS_GROCERY_READS_ENABLED=true`.
- [x] Added authenticated `GET /api/data-capabilities` so the browser can discover whether grocery reads should use Firebase or RDS without exposing database credentials.
- [x] Added `createGroceryApiClient().list(...)` and wired `GroceriesFeedProvider` to use the RDS grocery read API only when server capabilities report `groceries.reads = rds`; Firebase realtime remains the default and fallback path.
- [x] Added focused tests for server data capabilities, grocery API reads, data capability client behavior, and the RDS grocery feed path.
- [x] Verified with `npm test -- --ci`.
- [x] Verified with `npm run typecheck`.
- [x] Verified with `npm run architecture:check`.
- [x] Verified with `npm run prisma:validate`.
- [x] Verified with `npm run prisma:generate`.

## Next Local Sync Work

- [x] Integrate async agent outputs into `docs/architecture/firebase-to-rds-task-checklist.md` or a dedicated inventory appendix.
- [x] Ask product/engineering to accept or edit the proposed decisions in the decision log.
- [x] Prepare `GATE-1` sign-off.
- [x] Do not begin RDS code implementation until `GATE-1`, `GATE-2`, and production safety guardrails are accepted.
- [x] Provision staging RDS and choose/install the approved Prisma driver adapter before enabling runtime RDS behavior.
- [x] Wire the approved Prisma driver adapter into `getPrismaClient`.
- [ ] Configure/approve the production connection pooling strategy before production-like RDS traffic.
- [ ] Review and sign off `GATE-4` authorization repository before any client cutover to RDS.
- [x] Wire the grocery UI feed switch behind server-side RDS read capabilities.
- [ ] Wire remaining RDS grocery write handlers behind feature flags after staging RDS is available.
