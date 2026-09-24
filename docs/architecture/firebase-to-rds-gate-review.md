# Firebase to RDS Gate Review

Use this document to review and sign off the migration gates before implementation changes begin.

## GATE-1: Decision Log Accepted

Status: signed off on 2026-09-23 via chat approval of the recommended gate path.

Source: `docs/architecture/firebase-to-rds-migration-plan.md`

### Decisions

| Decision | Recommendation | Sign-off |
| --- | --- | --- |
| RDS engine | Use AWS RDS PostgreSQL, matching `prisma/schema.prisma`. | [x] Accept [ ] Change |
| Connection pooling | Required before production RDS traffic. Use RDS Proxy as the recommended path unless staging proves another approved option is needed. | [x] Accept [ ] Change |
| Realtime replacement | Phase 1 uses authenticated HTTP reads, refetch after mutation, refetch-on-focus, and short polling for critical shared screens. Add SSE/WebSockets only if needed. | [x] Accept [ ] Change |
| Image storage | Keep Firestore image storage out of phase 1. Move receipt/grocery images to S3 later as a separate storage migration. | [x] Accept [ ] Change |
| ID strategy | Preserve Firebase push IDs during backfill where references/verification need them; use generated UUIDs for new RDS-only records after cutover. | [x] Accept [ ] Change |
| Backup location | Store raw Firebase exports in encrypted, versioned, private S3 before staging or production import. Concrete bucket/account/region is still required before export. | [x] Accept [ ] Change |
| Rollback window | Keep Firebase untouched/read-only for at least 7 days after production cutover. | [x] Accept [ ] Change |
| Cutover write policy | Rehearse first, then choose write freeze or dual-write. Default recommendation is short write freeze unless rehearsal shows this is too disruptive. | [x] Accept [ ] Change |

### GATE-1 Blockers

- [x] Choose concrete connection pooling strategy.
- [x] Choose backup storage policy. Concrete bucket/account/region remains required before export.
- [x] Confirm rollback window length.
- [x] Confirm write freeze versus dual-write policy.

### GATE-1 Output

- [x] Update the decision log with accepted decisions.
- [x] Mark `RDS-001` complete in `docs/architecture/firebase-to-rds-task-checklist.md`.
- [x] Mark `GATE-1` complete in `docs/architecture/firebase-to-rds-task-checklist.md`.

## GATE-2: Discovery Accepted

Status: signed off on 2026-09-23 via chat approval of the recommended gate path.

Source: `docs/architecture/firebase-to-rds-discovery-findings.md`

### Findings To Accept

- [x] Current Firebase browser read/write inventory is complete enough to start repository/API design.
- [x] Current realtime dependency inventory is complete enough to choose phase 1 replacement behavior.
- [x] Authorization baseline is approved-members-only for list data, matching production Firebase rules.
- [x] Owner-only actions remain owner-only.
- [x] n8n machine writes remain limited by shared secret, scope, and allowed list.
- [x] Prisma schema is accepted as mostly covering app data, with listed transform decisions.
- [x] Firestore image collections are deferred from phase 1.

### GATE-2 Open Decisions

- [x] Resolve pending-member mismatch: production rules require approved members.
- [x] Decide how to populate `HouseholdList.ownerUid` and `normalizedOwnerEmail` for older Firebase roots.
- [x] Decide source of truth for `IdentityBinding` from email-keyed legacy data.
- [x] Decide whether `feedbacks` needs production-rule verification before migration.
- [x] Decide whether receipt price history remains client-computed in phase 1 or moves server-side.

### GATE-2 Output

- [ ] Update `docs/architecture/firebase-to-rds-discovery-findings.md` if any finding changes.
- [x] Mark `GATE-2` complete in `docs/architecture/firebase-to-rds-task-checklist.md`.
- [x] Permit `GATE-3` infrastructure foundation work.

## Hard Stop Before Code Changes

Do not enable RDS runtime behavior until:

- [x] `GATE-1` is signed off.
- [x] `GATE-2` is signed off.
- [ ] A staging RDS environment exists.
- [ ] A rollback owner is assigned.
- [ ] Production Firebase export/backup procedure is accepted.
