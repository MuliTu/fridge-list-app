# Firebase to RDS Production Safety Validation

This checklist defines the minimum validation bar for keeping the production app safe while RDS migration work proceeds.

## Production Defaults

- [ ] Firebase Realtime Database remains the production source of truth until cutover.
- [ ] Firebase Auth remains enabled and unchanged.
- [ ] RDS-backed code is disabled by default in production.
- [ ] Presence of `DATABASE_URL` alone does not enable RDS behavior.
- [ ] Any RDS runtime path requires an explicit feature flag or deployment config.
- [ ] Firebase data is not deleted or modified by migration tooling before cutover.

## Required Before Any Code PR

- [ ] `GATE-1` signed off.
- [ ] `GATE-2` signed off.
- [ ] Rollback owner assigned.
- [ ] Staging validation plan attached.
- [ ] Production flag default documented as off.
- [ ] Test plan listed in PR description.

## Required Before Any RDS-Backed Staging Test

- [ ] Staging RDS exists.
- [ ] Connection pooling decision is implemented or staging explicitly documents why it is safe without it.
- [ ] `DATABASE_URL` is staging-only.
- [ ] Prisma client is server-only.
- [ ] Architecture check prevents Prisma in browser bundles.
- [ ] List authorization adapter tests pass.
- [ ] No production Firebase export is required for early synthetic tests.

## Required Before Any Production Cutover

- [ ] Latest Firebase Realtime Database export saved in approved encrypted S3 location.
- [ ] Firestore image collections backed up or explicitly deferred with sign-off.
- [ ] RDS production snapshot strategy verified.
- [ ] Staging rehearsal completed.
- [ ] Verification report has no blocking differences.
- [ ] Smoke tests pass against staging RDS path.
- [ ] Rollback deployment or flag path verified.
- [ ] Write freeze or dual-write decision confirmed.
- [ ] Monitoring owner assigned.

## Minimum Test Commands By Change Type

Docs-only:

```bash
git diff --check
```

Architecture guardrails:

```bash
npm run test:architecture
npm run architecture:check
```

Type or server composition changes:

```bash
npm run typecheck
npm test -- --ci
```

Prisma schema/client changes:

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
```

User-facing grocery slice:

```bash
npm test -- --ci
npm run typecheck
npm run build
npm run test:e2e
```

Production cutover rehearsal:

```bash
npm run prisma:validate
npm run prisma:generate
npm run typecheck
npm test -- --ci
npm run test:architecture
npm run architecture:check
npm run build
npm run test:e2e
```

## Rollback Notes Required In Every Implementation PR

Each implementation PR must state:

- which feature flag/config controls the new path
- whether production default remains Firebase
- how to disable the RDS path
- whether any data was written
- whether rollback requires replaying writes
- whether Firebase cleanup is out of scope

## Hard Fails

Stop the rollout if any of these occur:

- Prisma or `DATABASE_URL` appears in a browser bundle.
- unauthorized user can read or mutate another list.
- pending invite/member can access list data without explicit product sign-off.
- Firebase export backup is missing before production import.
- RDS import verification has blocking differences.
- production error rate increases after enabling an RDS path.
- rollback path is unknown or untested.
