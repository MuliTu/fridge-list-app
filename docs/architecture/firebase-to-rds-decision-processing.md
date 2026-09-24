# Firebase to RDS Decision Processing

Use this when the migration owner answers the three-option questionnaire in `docs/architecture/firebase-to-rds-decision-questionnaire.md`.

The goal is to update the plan consistently before any implementation code starts.

## Input Format

Preferred compact answer format:

```text
Q1 A, Q2 A, Q3 A, Q4 A, Q5 A, Q6 A, Q7 A, Q8 A
Q9 A, Q10 A, Q11 A, Q12 A, Q13 A, Q14 A
Q15 A, Q16 A, Q17 A
```

If an answer uses option `C`, treat it as open chat/custom. Write the exact custom decision into the relevant decision record before marking it accepted.

## Processing Checklist

- [ ] Read `docs/architecture/firebase-to-rds-decision-questionnaire.md`.
- [ ] Read `docs/architecture/firebase-to-rds-open-decisions.md`.
- [ ] Map each question to its decision ID.
- [ ] Update each answered decision status to `Accepted` only when the answer is unambiguous.
- [ ] Leave unanswered or ambiguous decisions as `Open`.
- [ ] Update `docs/architecture/firebase-to-rds-migration-plan.md` decision log.
- [ ] Update `docs/architecture/firebase-to-rds-adrs.md` statuses where applicable.
- [ ] Update `docs/architecture/firebase-to-rds-gate-review.md` checkboxes/status.
- [ ] Update `docs/architecture/firebase-to-rds-signoff-record.md` with owner/date/source.
- [ ] Update `docs/architecture/firebase-to-rds-milestone-dashboard.md`.
- [ ] Update `docs/architecture/firebase-to-rds-task-checklist.md`.
- [ ] Run `git diff --check -- docs/architecture`.

## Question To Decision Map

| Question | Decision | Gate |
| --- | --- | --- |
| `Q1` | `DEC-001` RDS engine | `GATE-1` |
| `Q2` | `DEC-002` Connection pooling | `GATE-1` |
| `Q3` | `DEC-003` Realtime replacement phase 1 | `GATE-1` |
| `Q4` | `DEC-004` Image storage phase 1 | `GATE-1` |
| `Q5` | `DEC-005` ID strategy | `GATE-1` |
| `Q6` | `DEC-006` Backup location | `GATE-1` |
| `Q7` | `DEC-007` Rollback window | `GATE-1` |
| `Q8` | `DEC-008` Cutover write policy | `GATE-1` |
| `Q9` | `DEC-009` Pending member access | `GATE-2` |
| `Q10` | `DEC-010` Legacy list owner identity | `GATE-2` |
| `Q11` | `DEC-011` IdentityBinding source | `GATE-2` |
| `Q12` | `DEC-012` Feedback migration safety | `GATE-2` |
| `Q13` | `DEC-013` Receipt price history location | `GATE-2` |
| `Q14` | `DEC-014` Anonymous auth handling | `GATE-2` |
| `Q15` | `DEC-015` Staging RDS ownership | Infrastructure |
| `Q16` | `DEC-017` Migration operator | Infrastructure |
| `Q17` | `DEC-018` Monitoring owner | Infrastructure |

`DEC-016` production RDS sizing remains open until staging volume/load data exists.

## Gate Completion Rules

Mark `GATE-1` complete only when:

- [ ] `DEC-001` through `DEC-008` are accepted.
- [ ] backup/export policy has an owner and storage target.
- [ ] rollback window is accepted.
- [ ] write freeze or dual-write policy is accepted.

Mark `GATE-2` complete only when:

- [ ] `DEC-009` through `DEC-014` are accepted.
- [ ] discovery findings are accepted or updated with corrections.
- [ ] authorization baseline is accepted.
- [ ] schema mapping gaps have approved treatment.

Do not mark Milestone 2 started until both gates are complete and staging RDS ownership is assigned.

## If Answers Conflict

If an answer conflicts with current production behavior, stop the gate update and ask in this format:

```text
Decision needed: <short topic>

1. <recommended option>
2. <alternative option>
3. Open chat/custom answer
```

Keep the decision status as `Open` until the conflict is resolved.
