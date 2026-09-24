# Firebase to RDS Open Decisions

This register lists decisions that block milestone completion or implementation work.

## Decision Status Legend

- `Open`: no accepted answer yet.
- `Proposed`: recommendation exists but needs sign-off.
- `Accepted`: signed off and reflected in the plan/ADRs.

## Gate-1 Decisions

| ID | Decision | Status | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| `DEC-001` | RDS engine | Accepted | AWS RDS PostgreSQL | `GATE-1`, `RDS-010` |
| `DEC-002` | Connection pooling | Accepted | RDS Proxy recommended; implementation remains before production RDS traffic | `GATE-1`, `RDS-011`, production traffic |
| `DEC-003` | Realtime replacement phase 1 | Accepted | HTTP reads, mutation invalidation, refetch-on-focus, short polling for critical screens | `GATE-1`, `RDS-033` |
| `DEC-004` | Image storage phase 1 | Accepted | Keep Firestore image docs temporarily; migrate to S3 later | `GATE-1`, receipt/image planning |
| `DEC-005` | ID strategy | Accepted | Preserve Firebase IDs during backfill where practical; use UUIDs for new RDS-only rows | `GATE-1`, migration transforms |
| `DEC-006` | Backup location | Accepted | Encrypted, versioned, private S3 bucket; concrete bucket/account/region required before export | `GATE-1`, `RDS-040`, `RDS-041` |
| `DEC-007` | Rollback window | Accepted | Minimum 7 days after production cutover | `GATE-1`, `RDS-074`, cleanup |
| `DEC-008` | Cutover write policy | Accepted | Rehearse first; default to short write freeze unless dual-write is required | `GATE-1`, `RDS-073` |

## Gate-2 Decisions

| ID | Decision | Status | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| `DEC-009` | Pending member access | Accepted | Follow production Firebase rules: approved members only for list data | `GATE-2`, authorization tests |
| `DEC-010` | Legacy list owner identity | Accepted | Prefer `ownerUid`/`normalizedOwnerEmail`; classify missing owner identity as blocking unless recoverable from identity bindings | `GATE-2`, list transform |
| `DEC-011` | IdentityBinding source | Accepted | Populate from Firebase `/identityBindings` when present; otherwise derive only from verified Auth/export source | `GATE-2`, authorization adapter |
| `DEC-012` | Feedback migration safety | Accepted | Verify production feedback rules/data shape before enabling RDS feedback path | `GATE-2`, feedback migration |
| `DEC-013` | Receipt price history location | Accepted | Keep client-computed from receipt reads in phase 1; optimize server-side later if needed | `GATE-2`, receipts design |
| `DEC-014` | Anonymous auth handling | Accepted | Extend token verification to expose sign-in provider and reject anonymous | `GATE-2`, authorization tests |

## Infrastructure Decisions

| ID | Decision | Status | Recommendation | Blocks |
| --- | --- | --- | --- | --- |
| `DEC-015` | Staging RDS ownership | Accepted | Platform/engineering owns staging RDS; concrete person required before provisioning | `RDS-010` |
| `DEC-016` | Production RDS sizing | Open | Choose after staging load and data volume estimate | `RDS-070` |
| `DEC-017` | Migration operator | Accepted | Named operator required before any production export/import | `RDS-041`, `RDS-073` |
| `DEC-018` | Monitoring owner | Accepted | Named monitoring owner required before production cutover | `RDS-073`, `RDS-074` |

## How To Close A Decision

For each accepted decision:

- [ ] update this file status to `Accepted`
- [ ] update `docs/architecture/firebase-to-rds-migration-plan.md` decision log if applicable
- [ ] update ADR status if applicable
- [ ] update gate review checklist
- [ ] update milestone dashboard
- [ ] include sign-off owner/date in PR or review notes
