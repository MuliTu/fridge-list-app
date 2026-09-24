# Firebase to RDS Staging Rehearsal

This checklist prepares `RDS-071` and validates the cutover process before production.

## Goal

Prove that Firebase export, migration normalization, RDS import, verification, feature flags, smoke tests, and rollback all work in staging before production cutover.

## Preconditions

- [ ] `GATE-1` signed off.
- [ ] `GATE-2` signed off.
- [ ] staging RDS provisioned.
- [ ] connection pooling decision implemented or explicitly waived for staging.
- [ ] migration fixtures pass.
- [ ] migration transforms pass.
- [ ] verification report tooling exists.
- [ ] RDS-backed staging app paths are feature-flagged.
- [ ] rollback path is known.

## Rehearsal Inputs

Use one of:

- [ ] synthetic Firebase fixture export
- [ ] sanitized production-like export
- [ ] latest production export, only if approved and stored securely

Never commit production exports to the repository.

If production-derived data is used:

- [ ] approval owner recorded
- [ ] storage location recorded
- [ ] allowed operators listed
- [ ] retention/deletion date recorded
- [ ] staging cleanup owner recorded
- [ ] evidence collected that exports did not enter logs, reports, or the repository
- [ ] sanitization approach documented, if sanitized

## Rehearsal Steps

### 1. Prepare Environment

- [ ] Confirm staging branch/commit.
- [ ] Confirm staging app URL.
- [ ] Confirm staging `DATABASE_URL` is set server-side only.
- [ ] Confirm RDS flags are initially off.
- [ ] Confirm Firebase staging/current data source is healthy.

### 2. Backup Source Data

- [ ] Export Firebase Realtime Database JSON.
- [ ] Export Firestore image collections if included.
- [ ] Save raw export to approved staging backup location.
- [ ] Compute checksums.
- [ ] Write metadata.

### 3. Normalize

- [ ] Run normalization from raw export to normalized table-shaped JSON.
- [ ] Confirm raw export remains unchanged.
- [ ] Review skipped records.
- [ ] Review blocking records.
- [ ] Review warnings.

### 4. Import

- [ ] Start from empty staging RDS or documented baseline.
- [ ] Run import dry-run.
- [ ] Run import.
- [ ] Rerun import to prove idempotency.
- [ ] Record import duration.
- [ ] Record import row counts.

### 5. Verify

- [ ] Generate JSON verification report.
- [ ] Generate Markdown verification report.
- [ ] Confirm no blocking differences.
- [ ] Confirm orphan checks pass.
- [ ] Confirm sample list checks pass.
- [ ] Confirm owner/member authorization comparison passes.

### 6. Enable Staging Flags

Enable in order:

- [ ] `RDS_ENABLED`
- [ ] `RDS_LIST_AUTH_ENABLED`
- [ ] selected domain flag, starting with groceries

Do not enable all flags at once unless the rehearsal explicitly targets full cutover.

### 7. Smoke Test

Minimum grocery smoke:

- [ ] sign in
- [ ] load active list
- [ ] view groceries
- [ ] add grocery
- [ ] edit grocery details
- [ ] mark bought
- [ ] unmark bought
- [ ] delete grocery
- [ ] switch active list if data exists
- [ ] verify unauthorized list access is denied

Broader smoke when domains are included:

- [ ] categories load and update
- [ ] stock loads and updates
- [ ] receipts load/save/delete
- [ ] purchase insights load
- [ ] members/invites load
- [ ] feedback submit/retry path works
- [ ] whats-new loads

### 8. Rollback Test

- [ ] Disable RDS domain flag.
- [ ] Confirm Firebase path works again.
- [ ] Disable `RDS_ENABLED`.
- [ ] Confirm app still loads.
- [ ] Document whether any RDS-only writes need replay.

## Rehearsal Report

Create one rehearsal report from this template path:

```text
docs/architecture/rehearsals/YYYY-MM-DD-staging-rehearsal.md
```

Include:

- commit SHA
- input export type
- import duration
- row counts
- verification report link/path
- flags enabled
- smoke test results
- rollback result
- blockers
- go/no-go recommendation

Do not include credentials, raw exports, tokens, or private backup URLs.

## Pass Criteria

- [ ] import is repeatable
- [ ] verification has no blocking differences
- [ ] staging app works on RDS path for target domain
- [ ] rollback works
- [ ] no secret exposure
- [ ] no production Firebase mutation occurred

## Fail Criteria

- [ ] import loses records
- [ ] orphan checks fail
- [ ] unauthorized access succeeds
- [ ] app cannot roll back to Firebase path
- [ ] secrets appear in logs or reports
- [ ] production data is accidentally modified
