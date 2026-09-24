# Firebase to RDS PR 1 Start Packet

This packet describes the first code PR after `GATE-1` and `GATE-2` are accepted. It is intentionally implementation-ready, but it should remain dormant until the gates are signed.

## PR Goal

Add the server-only RDS foundation without changing production behavior.

Included tasks:

- [x] `RDS-012`: Add server-only Prisma client helper.
- [x] `RDS-013`: Add RDS environment validation.
- [x] `RDS-014`: Add architecture guardrail for Prisma imports.

Excluded tasks:

- [ ] No production RDS enablement.
- [ ] No Firebase Realtime Database removal.
- [ ] No application domain migration.
- [ ] No production data export/import.

## Required Before Opening PR

- [x] `GATE-1` accepted in `docs/architecture/firebase-to-rds-gate-review.md`.
- [x] `GATE-2` accepted in `docs/architecture/firebase-to-rds-gate-review.md`.
- [x] Decision answers recorded in `docs/architecture/firebase-to-rds-open-decisions.md`.
- [x] Sign-off owner/date recorded in `docs/architecture/firebase-to-rds-signoff-record.md`.
- [ ] Staging RDS connection string available outside the repository.

## File Plan

### Add `src/modules/shared/infrastructure/prismaClient.server.ts`

Purpose:

- centralize Prisma construction
- keep Prisma imports server-only
- validate `DATABASE_URL`
- cache the client for warm server runtimes

Context to preserve:

- `src/modules/composition.server.ts:1` already uses `@tanstack/react-start/server-only`.
- `prisma/schema.prisma:1-3` defines the Prisma 7 generated client output at `src/generated/prisma`.
- `prisma/schema.prisma:6-8` defines the PostgreSQL datasource.
- `docs/architecture/module-boundaries.md` defines current server/client boundaries.

Implementation notes:

- Import `@tanstack/react-start/server-only` at the top.
- Accept an environment object for testability.
- Import Prisma from the generated client path after `npm run prisma:generate`.
- Reject missing, malformed, or non-PostgreSQL database URLs.
- Do not log credentials or full connection strings.
- Do not instantiate the client at module import time.
- Uses the approved `@prisma/adapter-pg` `PrismaPg` adapter, with injectable factory support for tests.

### Add `src/modules/shared/infrastructure/prismaClient.server.test.ts`

Minimum test cases:

- [x] missing `DATABASE_URL` fails closed
- [x] malformed `DATABASE_URL` fails closed
- [x] unsupported protocol fails closed
- [x] `postgresql://` URL is accepted
- [x] `postgres://` URL is accepted
- [x] cached client path does not create a new client per call

### Update `src/modules/composition.server.ts`

Purpose:

- make `DATABASE_URL` available to server composition
- keep the database optional until an RDS capability is explicitly enabled

Context:

- `src/modules/composition.server.ts:40-51` defines current server environment keys.
- `src/modules/composition.server.ts:64-76` validates required configuration.
- `src/modules/composition.server.ts:141-147` caches warm server runtime instances.

Implementation notes:

- Add `DATABASE_URL?: string` to the server environment type.
- Do not require `DATABASE_URL` unless the Prisma helper or an explicit RDS capability is used.
- Do not let `DATABASE_URL` presence enable RDS behavior.
- Keep Firebase production paths unchanged.

### Update `scripts/check-architecture.mjs`

Purpose:

- prevent Prisma/RDS code from leaking into browser-capable modules

Context:

- `scripts/check-architecture.mjs`
- `scripts/check-architecture.test.mjs`
- `docs/architecture/module-boundaries.md`

Current checker locations:

- `scripts/check-architecture.mjs:14-27` defines forbidden packages for core application/domain code.
- `scripts/check-architecture.mjs:31-40` defines provider packages forbidden from route files.
- `scripts/check-architecture.mjs:45-53` defines server-only packages forbidden from client-capable code.
- `scripts/check-architecture.mjs:148-152` defines server-capable source locations.
- `scripts/check-architecture.mjs:242-264` emits client/server package and route/provider violations.

Proposed denied imports from browser-capable files:

- `src/generated/prisma`
- relative imports that resolve to `src/generated/prisma`
- `@prisma/client`
- `src/modules/shared/infrastructure/prismaClient.server`
- any future shared RDS helper that imports Prisma

Expected allowed zones:

- `src/modules/**/infrastructure/**/*.server.ts`
- `src/modules/**/server.ts`
- server route files under `src/routes/api/**`
- tests

Expected package-list changes:

- Add `@prisma/client` to server-only package checks.
- Add `src/generated/prisma` and relative generated-client import handling to server-only checks.
- Add direct Prisma provider imports to route/provider checks so routes keep using server composition.
- Keep generated output ignored as source, but not importable from client-capable source.

Expected denied zones:

- `src/components/**`
- `src/hooks/**`
- browser route files such as `src/routes/index.tsx`, `src/routes/stock.tsx`, and `src/routes/receipts.tsx`
- `src/lib/firebase.ts`

### Update `scripts/check-architecture.test.mjs`

Minimum test cases:

- [x] client-capable component importing Prisma fails
- [x] route importing Prisma fails
- [x] server infrastructure file importing Prisma passes
- [x] API route importing server composition passes

### Update `.env.example`

Purpose:

- document `DATABASE_URL` and RDS flags without enabling them

Rules:

- keep example values non-secret
- add PR-1-relevant flags as disabled examples if the implementation introduces flag parsing in this PR
- otherwise leave flags to the later capability PRs and keep `DATABASE_URL` validation lazy
- keep Firebase env vars documented while Firebase remains source of truth

## Production Safety Acceptance

Before merging PR 1:

- [x] `npm run prisma:validate` passes.
- [x] `npm run prisma:generate` passes.
- [x] `npm run test:architecture` passes.
- [x] `npm run architecture:check` passes.
- [x] `npm run typecheck` passes.
- [ ] Production defaults keep all RDS flags off.
- [ ] Reviewer confirms no browser bundle can import Prisma.
- [ ] Reviewer confirms Firebase runtime behavior is unchanged.

## Rollback

Rollback is low risk because PR 1 should be inert unless later RDS flags are enabled.

Rollback actions:

1. Set `RDS_ENABLED=false`.
2. Revert the PR if necessary.
3. Keep Firebase environment variables unchanged.
4. Confirm production reads/writes still use Firebase Realtime Database.

## Reviewer Notes

Review this PR as an infrastructure boundary PR, not a data migration PR.

Focus on:

- server-only containment
- validation behavior
- architecture checks
- zero production behavior change
- safe failure when RDS config is absent or invalid
