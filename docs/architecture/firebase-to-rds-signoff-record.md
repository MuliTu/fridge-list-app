# Firebase to RDS Sign-Off Record

Use this file to record approvals. Do not mark gates complete without a corresponding sign-off entry.

## GATE-1 Sign-Off

Status: signed off on 2026-09-23 via chat approval of the recommended gate path.

| Item | Decision | Accepted value | Owner | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| RDS engine | `DEC-001` | AWS RDS PostgreSQL | User via chat | 2026-09-23 | Recommended path accepted. |
| Connection pooling | `DEC-002` | RDS Proxy recommended | User via chat | 2026-09-23 | Must be implemented before production RDS traffic. |
| Realtime replacement | `DEC-003` | HTTP/refetch/polling first | User via chat | 2026-09-23 | SSE/WebSockets deferred unless needed. |
| Image storage | `DEC-004` | Keep Firestore images out of phase 1 | User via chat | 2026-09-23 | S3 image migration is separate. |
| ID strategy | `DEC-005` | Preserve Firebase IDs during backfill where practical | User via chat | 2026-09-23 | UUIDs for new RDS-only rows after cutover. |
| Backup location | `DEC-006` | Encrypted, versioned, private S3 | User via chat | 2026-09-23 | Concrete bucket/account/region still required before export. |
| Rollback window | `DEC-007` | Minimum 7 days | User via chat | 2026-09-23 | Firebase remains untouched/read-only through the window. |
| Cutover write policy | `DEC-008` | Rehearse first; default short write freeze | User via chat | 2026-09-23 | Dual-write only if rehearsal requires it. |

Approval:

- [x] Product accepts `GATE-1`.
- [x] Engineering accepts `GATE-1`.
- [x] Platform/operations accepts infrastructure-related `GATE-1` decisions, with concrete AWS owner/bucket details still required before export/cutover.

## GATE-2 Sign-Off

Status: signed off on 2026-09-23 via chat approval of the recommended gate path.

| Item | Decision | Accepted value | Owner | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| Firebase inventory | discovery finding | Accepted for repository/API design | User via chat | 2026-09-23 | Production data still requires backup/export verification. |
| Realtime inventory | discovery finding | HTTP/refetch/polling first | User via chat | 2026-09-23 | Realtime push deferred. |
| Authorization baseline | `DEC-009` | Approved members only | User via chat | 2026-09-23 | Matches production Firebase rules. |
| Legacy owner identity | `DEC-010` | Prefer `ownerUid`/`normalizedOwnerEmail`; block unrecoverable gaps | User via chat | 2026-09-23 | Recover through identity bindings when verified. |
| Identity binding source | `DEC-011` | `/identityBindings` or verified Auth/export source | User via chat | 2026-09-23 | Do not derive from unverified email-only data. |
| Feedback migration safety | `DEC-012` | Verify rules/data before enabling RDS feedback | User via chat | 2026-09-23 | Feedback path stays gated. |
| Receipt price history | `DEC-013` | Keep client-computed in phase 1 | User via chat | 2026-09-23 | Server aggregation deferred. |
| Anonymous auth handling | `DEC-014` | Expose sign-in provider and reject anonymous | User via chat | 2026-09-23 | Required before auth cutover. |

Approval:

- [x] Product accepts `GATE-2`.
- [x] Engineering accepts `GATE-2`.
- [x] Security/privacy reviewer accepts authorization baseline.

## GATE-3 Sign-Off

Status: not started.

Required evidence:

- [ ] staging RDS exists
- [ ] connection pooling decision implemented or explicitly waived for staging
- [ ] `DATABASE_URL` server-side only
- [ ] Prisma validation/generation works
- [ ] architecture guardrails pass

Approval:

- [ ] Engineering accepts `GATE-3`.
- [ ] Platform/operations accepts `GATE-3`.

## GATE-4 Sign-Off

Status: not started.

Required evidence:

- [ ] RDS list authorization repository implemented
- [ ] authorization tests pass
- [ ] pending member denial covered
- [ ] owner-only checks covered
- [ ] service principal behavior covered

Approval:

- [ ] Engineering accepts `GATE-4`.
- [ ] Security/privacy reviewer accepts `GATE-4`.

## GATE-5 Sign-Off

Status: not started.

Required evidence:

- [ ] export/import tooling exists
- [ ] fixtures pass
- [ ] idempotency tests pass
- [ ] verification report generated
- [ ] staging RDS can be rebuilt

Approval:

- [ ] Engineering accepts `GATE-5`.
- [ ] Platform/operations accepts `GATE-5`.

## GATE-6 Sign-Off

Status: not started.

Required evidence:

- [ ] selected staged app flows run without Firebase Realtime Database
- [ ] E2E smoke tests pass
- [ ] rollback path works
- [ ] production flags remain off

Approval:

- [ ] Product accepts staged behavior.
- [ ] Engineering accepts `GATE-6`.
- [ ] Operations accepts rollback evidence.
