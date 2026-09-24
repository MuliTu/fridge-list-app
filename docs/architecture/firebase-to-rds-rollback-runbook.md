# Firebase to RDS Rollback Runbook

This runbook prepares rollback for `RDS-073` and monitoring for `RDS-074`.

## Rollback Principles

- Prefer config/feature flag rollback before deployment rollback.
- Keep Firebase Realtime Database untouched until rollback window closes.
- Do not delete RDS data during rollback.
- Record whether any RDS-only writes occurred.
- If writes occurred only in RDS, decide whether to replay them to Firebase or accept a maintenance/data-freeze window.

## Rollback Triggers

Rollback if any of these occur after enabling RDS:

- app cannot load active lists
- grocery/category/stock/receipt flows fail for normal users
- unauthorized access succeeds
- RDS connection pool saturates
- error rate materially increases
- verification issue discovered after cutover
- data inconsistency affects user workflows
- support reports confirm missing or wrong data

## Rollback Decision Roles

| Role | Person | Responsibility |
| --- | --- | --- |
| Rollback owner | TBD | Executes rollback |
| Cutover lead | TBD | Makes go/no-go decision |
| App operator | TBD | Changes flags/deploy |
| Data owner | TBD | Assesses RDS-only writes |
| Communications owner | TBD | Notifies stakeholders |

## Fast Flag Rollback

Use when Firebase-backed code is still deployed and healthy.

Steps:

- [ ] Pause writes or re-enable maintenance/write-freeze mode before disabling RDS if any RDS writes may have occurred.
- [ ] Capture rollback decision timestamp.
- [ ] Capture cutover timestamp and RDS enablement timestamp.
- [ ] Export or list RDS-only writes between enablement and rollback decision.
- [ ] Classify RDS-only writes by domain.
- [ ] Decide replay vs accepted loss/maintenance window before switching users back.
- [ ] Record approver for the replay/data-loss decision.
- [ ] Set selected domain flag false.
- [ ] If broad issue, set `RDS_ENABLED=false`.
- [ ] Confirm app starts using Firebase path.
- [ ] Smoke test sign-in and active list load.
- [ ] Smoke test affected domain.
- [ ] Monitor errors for 30 minutes.
- [ ] Record timestamp and reason.

Expected result:

- Production returns to Firebase Realtime Database path.
- RDS data remains available for investigation.

## Deployment Rollback

Use when flags are insufficient or app deployment is faulty.

Steps:

- [ ] Identify last known good Firebase-backed deployment.
- [ ] Deploy or roll back to that version.
- [ ] Ensure RDS flags are off.
- [ ] Smoke test.
- [ ] Monitor.

Expected result:

- App runtime no longer uses RDS path.

## RDS-Only Writes Assessment

Before disabling RDS for a rollback, answer:

- [ ] Did any user writes land only in RDS?
- [ ] Which domains?
- [ ] What time window?
- [ ] Can they be replayed to Firebase safely?
- [ ] Is replay necessary for user-visible correctness?
- [ ] Is user communication required?
- [ ] Who approved replay, maintenance, or accepted data loss?

Possible actions:

- no replay needed
- replay selected writes to Firebase
- rerun cutover after fixing issue
- keep maintenance window until data is reconciled

## Rollback With RDS Writes

Use this path whenever production users could have written to RDS after cutover.

1. Pause writes with the approved freeze/maintenance mechanism.
2. Capture the RDS delta since the cutover enablement timestamp.
3. Classify delta records by list, user, domain, and operation.
4. Compare the delta to Firebase to find writes that are missing from Firebase.
5. Decide one of:
   - replay missing writes to Firebase
   - keep writes frozen until a fixed RDS path is restored
   - accept data loss only with named product/engineering approval and user communication decision
6. Run replay with tested tooling only.
7. Generate replay verification.
8. Resume Firebase path only after reconciliation sign-off.

## Data Replay Rules

Do not replay automatically unless the replay tooling was tested.

Replay must:

- preserve authorization
- preserve timestamps where possible
- avoid duplicate groceries/receipts/events
- log replayed record IDs
- produce a verification report

## Rollback Report Template

```text
Rollback date:
Trigger:
Decision maker:
Flags before:
Flags after:
Deployment before:
Deployment after:
RDS-only writes:
RDS delta export path:
Replay required:
Replay completed:
Replay verification:
Data-loss approval, if any:
Smoke test result:
Monitoring result:
Follow-up fixes:
```

## RDS Restore/PITR Procedure

Use this when rollback requires recovering RDS itself, not merely switching app traffic back to Firebase.

- [ ] Identify restore owner.
- [ ] Record desired restore timestamp.
- [ ] Confirm automated backups/PITR cover the timestamp.
- [ ] Restore to a new RDS instance or approved recovery database.
- [ ] Restore or rotate secrets for the recovery endpoint.
- [ ] Point a staging or isolated app runtime at the restored endpoint.
- [ ] Run verification report and smoke tests.
- [ ] Decide whether to promote restored RDS, replay data, or keep Firebase rollback.
- [ ] Record RTO, RPO, restore duration, snapshot/PITR IDs, and approver.

## Rollback Window Closure

Do not close rollback window until:

- [ ] no unresolved production issue remains
- [ ] RDS data verified
- [ ] Firebase no longer needed for rollback
- [ ] final RDS snapshot exists
- [ ] cleanup plan approved
