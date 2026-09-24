# Firebase to RDS Milestone Dashboard

This dashboard is the source of truth for milestone completion.

Production posture: no production runtime behavior has changed. Firebase Realtime Database remains the production source of truth.

Related control docs:

- `docs/architecture/firebase-to-rds-open-decisions.md`
- `docs/architecture/firebase-to-rds-risk-register.md`
- `docs/architecture/firebase-to-rds-signoff-record.md`

## Status Legend

- `Complete`: work and acceptance criteria are done.
- `Prepared`: docs/design/discovery work is done, but approval or external infrastructure is still needed.
- `In progress`: implementation has started, but required acceptance criteria remain open.
- `Blocked`: cannot proceed safely without a decision, environment, or gate.
- `Not started`: no implementation work has begun.

## Milestone Summary

| Milestone | Status | What is complete | What remains |
| --- | --- | --- | --- |
| Milestone 0: Decisions and Readiness | Prepared | Decision log accepted, ADRs proposed, gate review ready, safety docs ready | Provision non-production RDS; assign concrete infrastructure/export/monitoring owners |
| Milestone 1: Data and Dependency Inventory | Complete | `RDS-002`, `RDS-003`, `RDS-004`, `RDS-005` complete; discovery findings accepted | None for gate; production export verification still required before cutover |
| Milestone 2: Prisma Infrastructure Foundation | In progress | `RDS-012`, `RDS-013`, and `RDS-014` complete | Requires staging RDS, connection pooling/adapter wiring, and RDS list authorization |
| Milestone 3: First Vertical Slice - Groceries | In progress | RDS grocery read/write repositories, read service, and HTTP handler implemented but unwired | Requires staging RDS, feature flags, UI feed switch, write route wiring, and staging acceptance |
| Milestone 4: Migration Tooling | Prepared design only | Export procedure, fixture/verification design, backup policy draft | Requires backup policy approval, fixtures, transforms, import scripts, verification tooling |
| Milestone 5: Remaining Product Domains | Not started | Domain order and task list defined | Requires accepted grocery slice pattern |
| Milestone 6: Production Cutover Preparation | Prepared design only | Infrastructure checklist, staging rehearsal, cutover, rollback, communication docs prepared | Requires production RDS, staging rehearsal, verification evidence, rollback proof |
| Milestone 7: Production Cutover | Not started | Runbook prepared | Requires all previous gates and explicit go/no-go |
| Milestone 8: Stabilization and Cleanup | Not started | Cleanup principles documented | Requires successful cutover and rollback window closure |

## Completed Work Items

- [x] `RDS-001`: decision log preparation
- [x] `RDS-002`: Firebase browser read/write inventory
- [x] `RDS-003`: realtime dependency inventory
- [x] `RDS-004`: authorization mapping
- [x] `RDS-005`: schema gap analysis
- [x] `RDS-012`: server-only Prisma client helper
- [x] `RDS-013`: RDS environment validation
- [x] `RDS-014`: Prisma import architecture guardrail
- [x] `RDS-020`: RDS list authorization repository
- [x] `RDS-021`: authorization tests
- [x] `RDS-030`: Prisma grocery write repository
- [x] `RDS-031`: grocery read service/API handler
- [x] migration spec
- [x] migration plan
- [x] task checklist
- [x] discovery findings
- [x] gate review checklist
- [x] ADRs
- [x] feature flag matrix
- [x] PR breakdown
- [x] RDS foundation design
- [x] grocery first-slice design
- [x] migration fixtures and verification design
- [x] export/backup procedure draft
- [x] AWS RDS infrastructure checklist
- [x] staging rehearsal checklist
- [x] production cutover runbook
- [x] rollback runbook
- [x] communication plan
- [x] production safety validation checklist
- [x] open decision register
- [x] risk register
- [x] sign-off record template

## Gate Status

| Gate | Status | Required before completion |
| --- | --- | --- |
| `GATE-1`: Decision Log Accepted | Complete | Signed off via recommended gate path |
| `GATE-2`: Discovery Accepted | Complete | Signed off via recommended gate path |
| `GATE-3`: Staging RDS and Prisma Foundation Ready | In progress | Staging RDS, pooling decision, adapter wiring, authorization foundation |
| `GATE-4`: Authorization Repository Approved | Ready for review | RDS list authorization implementation and tests |
| `GATE-5`: Migration Tooling Rebuilds Staging RDS | Not started | Export/import/verify tooling passes in staging |
| `GATE-6`: Staging App Works Without Firebase RTDB For Normal Flows | Not started | Migrated staged flows and E2E smoke tests |

## Milestone 0 Completion Checklist

Milestone 0 can be marked `Complete` when:

- [x] RDS PostgreSQL accepted.
- [x] connection pooling strategy accepted.
- [x] realtime replacement phase 1 accepted.
- [x] Firestore image storage deferral accepted.
- [x] ID strategy accepted.
- [x] backup location accepted.
- [x] rollback window accepted.
- [x] write freeze vs dual-write policy accepted.
- [ ] non-production RDS exists.
- [ ] staging `DATABASE_URL` is available server-side.
- [ ] Prisma can validate/generate against the intended setup.

Current status: `Prepared`, not complete because non-production RDS is not provisioned.

## Milestone 1 Completion Checklist

Milestone 1 can be marked `Complete` when:

- [x] Firebase read/write inventory exists.
- [x] realtime dependency inventory exists.
- [x] authorization mapping exists.
- [x] schema gap analysis exists.
- [x] discovery findings are consolidated.
- [x] pending-member access decision accepted.
- [x] legacy owner UID/email source decision accepted.
- [x] identity binding source decision accepted.
- [x] feedback migration/rules decision accepted.
- [x] `GATE-2` signed off.

Current status: `Complete`.

## Next Milestone To Actually Complete

Continue Milestone 2:

1. provision staging RDS
2. choose connection pooling
3. wire the approved Prisma driver adapter/client factory
4. wire RDS list authorization into staging composition
5. route grocery reads/writes behind feature flags
6. run architecture, type, and unit tests

Do not enable RDS runtime behavior until staging RDS, connection pooling, adapter wiring, and rollback controls are ready.
