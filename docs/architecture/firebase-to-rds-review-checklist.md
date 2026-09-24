# Firebase to RDS Review Checklist

Use this checklist when reviewing the migration docs or any future PR in this migration branch.

## Documentation Review

- [ ] The current source of truth is clear: Firebase remains production data source until production cutover.
- [ ] The target data store is clear: AWS RDS PostgreSQL through server-side APIs.
- [ ] Firebase Auth is explicitly kept for phase 1.
- [ ] Firestore image docs are explicitly deferred or separately approved.
- [ ] The rollback window is defined and owner-assigned.
- [ ] The backup/export location is defined before any production export.
- [ ] Gate statuses match across the index, checklist, dashboard, gate review, sign-off record, and workstream status.
- [ ] All open decisions that block `GATE-1` or `GATE-2` are either accepted or still clearly marked open.

## Production Safety Review

- [ ] No code path enables RDS because `DATABASE_URL` exists.
- [ ] All RDS feature flags default off.
- [ ] The global kill switch disables every RDS-backed app-data path.
- [ ] Firebase Realtime Database remains readable and restorable during rollback window.
- [ ] Production writes have an approved freeze or dual-write policy before cutover.
- [ ] Raw Firebase exports are encrypted, access-controlled, versioned, and retained according to policy.
- [ ] No secrets, tokens, database URLs, or raw user exports are committed.

## Data Integrity Review

- [ ] Firebase path inventory covers user config, lists, members, invites, groceries, categories, stock, receipts, purchase history, whats-new, and feedback.
- [ ] Migration tooling is idempotent.
- [ ] Verification reports include counts, orphan checks, required field checks, and sample comparisons.
- [ ] Legacy owner identity handling is approved.
- [ ] Identity binding source of truth is approved.
- [ ] Pending member access behavior matches the accepted product/security decision.
- [ ] Receipt line-item and price-history behavior is accepted for phase 1.

## Authorization Review

- [ ] Browser code never connects directly to RDS.
- [ ] RDS access is server-side only.
- [ ] Owners can read/write owner-scoped data.
- [ ] Approved members can read/write only accepted list-scoped data.
- [ ] Pending members cannot read/write list data unless a product/security decision explicitly changes this.
- [ ] Unknown users and anonymous users fail closed.
- [ ] n8n/service writes remain scoped and separately authenticated.

## PR 1 Review

- [ ] Server-only Prisma helper imports `@tanstack/react-start/server-only`.
- [ ] Prisma client is lazy and cached for warm server runtimes.
- [ ] `DATABASE_URL` validation rejects missing/malformed/non-PostgreSQL values when RDS capability is used.
- [ ] `DATABASE_URL` is optional when all RDS flags are off.
- [ ] Architecture check rejects Prisma imports from client-capable source files.
- [ ] Architecture tests cover both allowed server imports and denied client imports.
- [ ] Typecheck, architecture check, Prisma validation, and Prisma generation pass.

## Cutover Review

- [ ] Staging rehearsal has completed with documented timings.
- [ ] Production export has a named operator.
- [ ] Production import has a named operator.
- [ ] Monitoring owner is assigned.
- [ ] Rollback owner is assigned.
- [ ] User/admin communication is prepared.
- [ ] Cutover go/no-go decision is recorded.
- [ ] Post-cutover verification is complete before write access is fully reopened.
