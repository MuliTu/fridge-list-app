# Firebase to RDS Migration Index

This is the navigation hub for the Firebase Realtime Database to AWS RDS PostgreSQL migration.

## Start Here

- `docs/architecture/firebase-to-rds-migration-spec.md`: what we are changing and why.
- `docs/architecture/firebase-to-rds-migration-plan.md`: milestone plan and decision log.
- `docs/architecture/firebase-to-rds-milestone-dashboard.md`: current milestone completion dashboard.
- `docs/architecture/firebase-to-rds-task-checklist.md`: executable task checklist with checkboxes.
- `docs/architecture/firebase-to-rds-workstream-status.md`: current status.

## Gate Review

- `docs/architecture/firebase-to-rds-gate-review.md`: `GATE-1` and `GATE-2` sign-off checklist.
- `docs/architecture/firebase-to-rds-adrs.md`: proposed architecture decisions.
- `docs/architecture/firebase-to-rds-open-decisions.md`: decisions blocking milestone completion.
- `docs/architecture/firebase-to-rds-decision-questionnaire.md`: three-option decision questionnaire.
- `docs/architecture/firebase-to-rds-decision-processing.md`: how to apply accepted answers across migration docs.
- `docs/architecture/firebase-to-rds-gate-ready-summary.md`: shortest path to `GATE-1`/`GATE-2`.
- `docs/architecture/firebase-to-rds-risk-register.md`: migration risks and mitigations.
- `docs/architecture/firebase-to-rds-signoff-record.md`: formal gate sign-off record.
- `docs/architecture/firebase-to-rds-discovery-findings.md`: read-only discovery findings.

## Safety

- `docs/architecture/firebase-to-rds-production-safety-validation.md`: production safety and test expectations.
- `docs/architecture/firebase-to-rds-review-checklist.md`: reviewer checklist for docs, safety, data integrity, authorization, PR 1, and cutover.
- `docs/architecture/firebase-export-backup-procedure.md`: Firebase export and backup procedure.
- `docs/architecture/firebase-to-rds-rollback-runbook.md`: rollback plan.
- `docs/architecture/firebase-to-rds-communication-plan.md`: user/admin communication templates.

## Infrastructure And Flags

- `docs/architecture/aws-rds-infrastructure-checklist.md`: staging/production RDS checklist.
- `docs/architecture/aws-rds-staging-provisioning-runbook.md`: staging RDS provisioning runbook.
- `docs/architecture/firebase-to-rds-feature-flags.md`: feature flags and rollout controls.

## Implementation Designs

- `docs/architecture/rds-foundation-implementation-design.md`: Prisma client, environment validation, architecture guardrails, authorization.
- `docs/architecture/firebase-to-rds-pr1-start-packet.md`: first implementation PR packet after gates are accepted.
- `docs/architecture/grocery-rds-first-slice-design.md`: first grocery RDS vertical slice.
- `docs/architecture/migration-fixtures-verification-design.md`: fixtures, transforms, idempotency, verification reports.

## Rollout

- `docs/architecture/firebase-to-rds-pr-breakdown.md`: PR sequence and PR template.
- `docs/architecture/firebase-to-rds-staging-rehearsal.md`: staging cutover rehearsal.
- `docs/architecture/firebase-to-rds-production-cutover-runbook.md`: production cutover runbook.

## Current Gate State

- `RDS-001`: prepared.
- `RDS-002`: complete.
- `RDS-003`: complete.
- `RDS-004`: complete.
- `RDS-005`: complete.
- `RDS-012`: complete.
- `RDS-013`: complete.
- `RDS-014`: complete.
- `GATE-1`: complete.
- `GATE-2`: complete.
- Milestone 0: prepared, not complete.
- Milestone 1: complete.
- Milestone 2: in progress.
- Milestone 3-8: not started.

Do not enable RDS runtime behavior until staging RDS, connection pooling, adapter wiring, authorization, backups, and rollback controls are ready.

## Known Open Decisions

- backup bucket/account/region
- concrete staging RDS owner/person
- Prisma driver adapter installation/wiring
- migration operator
- monitoring owner
- production RDS sizing

See `docs/architecture/firebase-to-rds-open-decisions.md` for the full decision register.
