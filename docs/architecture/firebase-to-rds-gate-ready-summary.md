# Firebase to RDS Gate-Ready Summary

This is the shortest review path for completing `GATE-1` and `GATE-2`.

## Current Recommendation Bundle

Accepting this bundle means:

- use AWS RDS PostgreSQL
- keep Firebase Auth in phase 1
- keep Firestore images out of phase 1
- use server-owned APIs for RDS access
- replace Firebase realtime initially with HTTP refetch/polling
- preserve Firebase IDs during backfill where practical
- default to short write freeze unless rehearsal requires dual-write
- deny pending members list-data access unless product explicitly changes the rule
- save Firebase exports to encrypted, versioned, private S3
- keep Firebase untouched through rollback window

## Fast Approval Path

To approve the recommended path, answer:

```text
Q1 A, Q2 A, Q3 A, Q4 A, Q5 A, Q6 A, Q7 A, Q8 A
Q9 A, Q10 A, Q11 A, Q12 A, Q13 A, Q14 A
Q15 A, Q16 A, Q17 A
```

Then update:

- `docs/architecture/firebase-to-rds-open-decisions.md`
- `docs/architecture/firebase-to-rds-signoff-record.md`
- `docs/architecture/firebase-to-rds-milestone-dashboard.md`
- `docs/architecture/firebase-to-rds-task-checklist.md`

Processing checklist: `docs/architecture/firebase-to-rds-decision-processing.md`

## Gate Status

The recommended path was approved in chat on 2026-09-23.

## Minimum Needed To Enable RDS Runtime Behavior

Before RDS runtime behavior is enabled:

- [x] `GATE-1` signed off.
- [x] `GATE-2` signed off.
- [ ] staging RDS owner assigned.
- [ ] rollback owner assigned.
- [ ] production safety guardrails accepted.

## First Code Milestone After Approval

Milestone 2:

1. provision staging RDS
2. choose/configure connection pooling
3. add server-only Prisma client helper
4. add `DATABASE_URL` validation
5. add architecture guardrails
6. add RDS list authorization
7. add tests

## Recommended First PR

PR 1: RDS Foundation

Tasks:

- `RDS-012`
- `RDS-013`
- `RDS-014`

Status: complete as dormant foundation. Real adapter wiring remains blocked by staging RDS and the approved connection pooling/adapter setup.

Why first:

- no user-facing behavior change
- no production data migration
- builds server-only safety boundary
- creates testable foundation for later work

Production default:

- RDS code disabled unless explicit flags are enabled.
- Firebase remains production source of truth.
