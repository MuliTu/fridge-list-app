# RDS Foundation Implementation Design

This design prepares `RDS-012`, `RDS-013`, `RDS-014`, `RDS-020`, and `RDS-021`. It is a pre-implementation blueprint only; do not start coding it until `GATE-1` and `GATE-2` are signed off.

Implementation split:

- PR 1 is limited to `RDS-012`, `RDS-013`, and `RDS-014`: Prisma helper, lazy database URL validation, and architecture guardrails.
- PR 2 handles `RDS-020` and `RDS-021`: list authorization repository and authorization tests.

## Scope

Build the server-only RDS foundation needed before any domain can safely move from Firebase Realtime Database to RDS:

- server-only Prisma client construction
- `DATABASE_URL` validation
- architecture guardrails so Prisma never reaches client bundles
- RDS-backed list authorization
- authorization tests

For PR 1, only the first three items are in scope. The authorization items remain in this design as the next foundation slice.

## Non-Goals

- No production data migration.
- No Firebase Realtime Database removal.
- No client behavior changes.
- No grocery repository implementation. That belongs to the first vertical slice.
- No image storage migration.

## Current Code Context

- Prisma schema: `prisma/schema.prisma`
- Generated client target: `prisma/schema.prisma:1-3`, with output at `src/generated/prisma`
- Server composition boundary: `src/modules/composition.server.ts`
- Server-only marker pattern: `src/modules/composition.server.ts:1`
- Current server environment type: `src/modules/composition.server.ts:40`
- Required config helper: `src/modules/composition.server.ts:64`
- Current broad list auth port: `src/modules/groceries/application/listAuthorizationRepository.ts`
- Authenticated request principal: `src/modules/shared/application/requestContext.ts`
- Token verification output: `src/modules/identity/application/tokenVerifier.ts`
- Grocery auth placeholder: `src/modules/composition.server.ts:231`
- Receipt auth placeholder: `src/modules/composition.server.ts:319`

## Proposed File Additions

PR 1:

```text
src/modules/shared/infrastructure/prismaClient.server.ts
src/modules/shared/infrastructure/prismaClient.server.test.ts
```

PR 2:

```text
src/modules/lists/application/listAuthorizationRepository.ts
src/modules/lists/infrastructure/prismaListAuthorizationRepository.server.ts
src/modules/lists/infrastructure/prismaListAuthorizationRepository.server.test.ts
src/modules/lists/index.ts
src/modules/lists/server.ts
```

If adding a new `lists` module feels too broad for the first patch, place the adapter next to the existing grocery auth port first, then extract when list APIs are implemented. The cleaner long-term boundary is a `lists` module because groceries, stock, receipts, categories, invites, and config all need list authorization.

## Prisma Client Boundary

Requirements:

- server-only import at top of file
- construct Prisma client lazily
- cache for warm server runtimes
- never import from client-capable files
- accept injected URL or environment only at the server composition boundary
- fail closed when `DATABASE_URL` is missing or malformed

Suggested API:

```ts
export type PrismaClientEnvironment = {
  DATABASE_URL?: string
}

export const databaseUrl = (environment: PrismaClientEnvironment): string => {
  // validate protocol, username/password presence, hostname, database path
}

export const getPrismaClient = (
  environment: PrismaClientEnvironment = process.env
): PrismaClient => {
  // lazy cached construction
}
```

Decision needed:

- Prisma 7 currently generates the client into `src/generated/prisma`; the helper should import from the generated client after `npm run prisma:generate`.
- Keep `@prisma/client` in guardrails as a defensive forbidden package if it is introduced later.
- The approved driver adapter is `@prisma/adapter-pg` using `PrismaPg`; keep injected factory support for tests.

## Server Composition Changes

Extend `ServerEnvironment` with:

```ts
DATABASE_URL?: string
```

Add a cached `prismaClient` or database dependency method inside `ServerComposition`.

Do not eagerly validate `DATABASE_URL` at module load. Follow the existing pattern where optional integrations validate lazily per capability.

## Architecture Guardrail

Extend `scripts/check-architecture.mjs` to reject imports of:

- `src/generated/prisma`
- relative imports that resolve to `src/generated/prisma`
- `@prisma/client`, if introduced
- `*.server.ts` Prisma helper files from client-capable files

Expected allowed zones:

- `src/modules/**/infrastructure/**/*.server.ts`
- `src/modules/**/server.ts`
- server route files under `src/routes/api/**`
- tests

Expected denied zones:

- `src/components/**`
- `src/hooks/**`
- `src/routes/index.tsx`, `src/routes/stock.tsx`, `src/routes/receipts.tsx`
- `src/lib/firebase.ts`
- any browser-safe module entry point

Generated Prisma files should remain skipped as checked source files, but imports of the generated client must still be forbidden from client-capable files and direct route files.

## Authorization Port Shape

The existing port is:

```ts
assertAccessible(principal, listId): Promise<void>
```

Discovery showed we need a richer shape. Proposed interface:

```ts
export interface ListAuthorizationRepository {
  assertListReadable(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertListWritable(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertListOwner(principal: AuthenticatedPrincipal, listId: string): Promise<void>
  assertOwnIdentity(principal: AuthenticatedPrincipal, uid: string): Promise<void>
}
```

Compatibility option:

```ts
assertAccessible = assertListWritable
```

Use compatibility during the first grocery/receipt migration so existing services can keep compiling while the richer calls are introduced gradually.

## RDS Authorization Rules

List read/write access:

```text
principal.kind = user
AND (
  household_lists.ownerUid = principal.uid
  OR household_members.uid = principal.uid
     AND household_members.status = Approved
)
```

Owner-only:

```text
principal.kind = user
AND household_lists.ownerUid = principal.uid
```

Own identity:

```text
principal.kind = user
AND principal.uid = requested uid
```

Machine writes:

Handled separately by `N8nMachineAuthenticator` and grocery persistence service. Do not allow service principals into browser-user list APIs unless the use case explicitly supports them.

## Anonymous Auth Gap

Firebase rules reject anonymous sign-in providers. Current server principal has:

```ts
uid
email
emailVerified
```

It does not expose:

```ts
signInProvider
```

Before cutover, choose one:

- extend token verification to include sign-in provider and reject `anonymous`
- document and verify that anonymous Firebase Auth is disabled in production

The safer implementation path is to expose `signInProvider` and test anonymous denial.

## Test Plan

Prisma client helper:

- missing `DATABASE_URL` fails closed
- malformed URL fails closed
- non-PostgreSQL protocol fails closed
- valid PostgreSQL URL accepted
- cached client is reused in a warm runtime

Architecture guardrail:

- client hook importing Prisma fails
- server infrastructure importing Prisma passes
- route API importing server composition passes

Authorization adapter:

- owner can read/write list
- approved member can read/write list-scoped app data
- pending member cannot read/write list data
- unknown user cannot access list
- member cannot pass owner-only check
- owner can pass owner-only check
- service principal denied by user-list auth adapter unless explicitly supported
- own identity passes only for matching UID
- authorization failure occurs before repository mutation in groceries/receipts services

## Rollback

Foundation code can ship disabled as long as composition keeps Firebase-backed runtime paths active. Rollback is:

- keep Firebase repository wiring active
- do not enable RDS-backed services
- remove or disable RDS feature flag/config if introduced

No production data should be changed by this foundation work.

## Exit Criteria

PR 1:

- Server-only Prisma helper exists and is tested.
- `DATABASE_URL` validation exists and is tested.
- Architecture check prevents Prisma in client bundles.
- Production Firebase behavior is unchanged.

PR 2:

- RDS list authorization adapter exists and is tested.
- Server composition can construct the RDS authorization adapter in staging only.
- Production Firebase behavior is unchanged.
