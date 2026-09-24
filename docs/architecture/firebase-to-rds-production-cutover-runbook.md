# Firebase to RDS Production Cutover Runbook

This runbook prepares `RDS-072` and `RDS-073`. Do not execute it until all gates and rehearsal criteria are complete.

## Hard Preconditions

- [ ] `GATE-1` signed off.
- [ ] `GATE-2` signed off.
- [ ] `GATE-3` complete.
- [ ] `GATE-4` complete.
- [ ] `GATE-5` complete.
- [ ] `GATE-6` complete for the selected cutover scope.
- [ ] staging rehearsal passed.
- [ ] production RDS is provisioned and monitored.
- [ ] connection pooling is configured.
- [ ] rollback owner assigned.
- [ ] monitoring owner assigned.
- [ ] write freeze or dual-write policy confirmed.
- [ ] cutover lead, database operator, app deploy operator, verification owner, rollback owner, communications owner, and backups are named.
- [ ] go/no-go decision authority is named.
- [ ] write freeze enforcement method is tested.
- [ ] rollback-with-RDS-writes procedure is accepted.
- [ ] RDS restore/PITR drill is complete or explicitly accepted as a production risk.

## Cutover Roles

| Role | Person | Responsibility |
| --- | --- | --- |
| Cutover lead | TBD | Owns timeline and go/no-go calls |
| Database operator | TBD | Runs export/import/snapshot steps |
| App deploy operator | TBD | Switches flags/deployments |
| Verification owner | TBD | Runs reports and smoke tests |
| Rollback owner | TBD | Executes rollback if needed |
| Communications owner | TBD | Sends user/admin notices if needed |
| Go/no-go approver | TBD | Makes final proceed/rollback decision |
| Backup operator | TBD | Confirms Firebase export and RDS snapshot evidence |

## Production Cutover Inputs

- [ ] production Firebase project ID
- [ ] production Firebase database URL
- [ ] production Firestore project
- [ ] production RDS endpoint
- [ ] approved backup bucket
- [ ] commit SHA
- [ ] feature flag values
- [ ] verification command
- [ ] smoke test checklist
- [ ] rollback command/flag values

Do not write secrets into this document.

## T-minus Checklist

### T-24h

- [ ] Confirm no blocking production incidents.
- [ ] Confirm latest staging rehearsal passed.
- [ ] Confirm backup bucket is writable.
- [ ] Confirm RDS monitoring is healthy.
- [ ] Confirm rollback deployment/flags are available.
- [ ] Confirm cutover window.
- [ ] Notify stakeholders if write freeze is planned.

### T-1h

- [ ] Confirm app health.
- [ ] Confirm Firebase health.
- [ ] Confirm RDS health.
- [ ] Confirm operators are present.
- [ ] Confirm no schema drift.
- [ ] Confirm migration scripts match deployed commit.

### T-0

- [ ] Start write freeze or dual-write policy.
- [ ] Record freeze method and exact flag/command values.
- [ ] Record freeze start timestamp.
- [ ] Record last accepted Firebase write timestamp.
- [ ] Confirm no Firebase writes landed after freeze start, or record approved dual-write behavior.
- [ ] Record current app version/commit.
- [ ] Confirm production RDS flags are still off.

## Cutover Steps

### 1. Export Firebase

- [ ] Export full Realtime Database JSON.
- [ ] Export Firestore image collections if in scope.
- [ ] Compute checksums.
- [ ] Upload raw exports to approved S3 location.
- [ ] Upload metadata.
- [ ] Verify S3 objects are encrypted and private.
- [ ] Verify top-level Firebase paths exist in the export.
- [ ] Record source object counts and export size.
- [ ] Run post-export write-delta check against Firebase using the freeze timestamp.

### 2. Normalize And Import

- [ ] Normalize raw export.
- [ ] Review blocking records.
- [ ] Run import dry-run.
- [ ] Import into production RDS.
- [ ] Record import duration.
- [ ] Record row counts.

### 3. Verify

- [ ] Generate verification report.
- [ ] Confirm no blocking differences.
- [ ] Confirm orphan checks pass.
- [ ] Confirm sample lists pass.
- [ ] Confirm authorization checks pass.
- [ ] Store verification report in approved location.

### 4. Snapshot

- [ ] Take manual RDS snapshot after successful import.
- [ ] Record snapshot ID.
- [ ] Confirm snapshot status.

### 5. Enable RDS Path

Enable only selected scope:

- [ ] `RDS_ENABLED=true`
- [ ] `RDS_LIST_AUTH_ENABLED=true`
- [ ] selected domain flags

Record each flag value before and after.

### 6. Smoke Test

- [ ] sign in
- [ ] load active list
- [ ] run selected domain smoke tests
- [ ] verify unauthorized access denied
- [ ] verify logs have no secret leakage
- [ ] verify error rate is normal
- [ ] verify DB connections are healthy

Required threshold placeholders:

- [ ] app error rate: below `<accepted threshold>` over `<baseline window>`
- [ ] auth-denied rate: expected denied checks only; no unauthorized access succeeds
- [ ] failed login rate: below `<accepted threshold>` over `<baseline window>`
- [ ] p95 app/API latency: below `<accepted threshold>`
- [ ] RDS connection utilization: below `<accepted percentage>`
- [ ] connection pool saturation: zero sustained saturation over `<duration>`
- [ ] slow query threshold: no query slower than `<threshold>` without accepted explanation
- [ ] smoke test failures: zero blocking failures

### 7. End Freeze Or Continue Monitoring

- [ ] If smoke passes, end write freeze.
- [ ] If smoke fails, trigger rollback decision.
- [ ] Announce cutover result if needed.
- [ ] Start rollback window timer.

## Cutover Safety Evidence

Record these before ending the write freeze:

| Evidence | Value |
| --- | --- |
| Freeze method | TBD |
| Freeze flag/command values | TBD |
| Freeze start timestamp | TBD |
| Last accepted Firebase write timestamp | TBD |
| Post-export Firebase write-delta result | TBD |
| Backup S3 prefix | TBD |
| RTDB export checksum | TBD |
| Source counts path | TBD |
| Firestore image backup decision/sign-off | TBD |
| Import run ID | TBD |
| Verification report path | TBD |
| Manual RDS snapshot ID | TBD |
| PITR timestamp captured | TBD |
| Rollback window end | TBD |
| Go/no-go approver | TBD |
| Rollback owner | TBD |
| Monitoring dashboard links | TBD |

## Go/No-Go Points

Stop and rollback if:

- export missing or corrupt
- import fails
- verification has blocking differences
- unauthorized access succeeds
- app cannot load selected domain
- error rate rises materially
- DB connections saturate
- secrets appear in logs
- post-export Firebase write-delta check finds unaccounted writes
- rollback owner or go/no-go approver is unavailable

## Cutover Log Template

```text
Cutover date:
Commit SHA:
Firebase export started:
Firebase export completed:
S3 backup path:
Normalize started:
Normalize completed:
Import started:
Import completed:
Verification completed:
RDS snapshot ID:
Flags enabled:
Smoke started:
Smoke completed:
Freeze ended:
Rollback window ends:
Notes:
```

## Post-Cutover

- [ ] Monitor through rollback window.
- [ ] Keep Firebase untouched/read-only.
- [ ] Do not remove Firebase code.
- [ ] Capture issues and remediation.
- [ ] Prepare cleanup only after rollback window closes.
