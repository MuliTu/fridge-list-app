# Firebase to RDS PR Breakdown

This breakdown sequences implementation into reviewable pull requests. It assumes `GATE-1` and `GATE-2` are signed off before code PRs start.

## PR 1: RDS Foundation

Start packet: `docs/architecture/firebase-to-rds-pr1-start-packet.md`

Tasks:

- `RDS-012`
- `RDS-013`
- `RDS-014`

Files likely touched:

- `src/modules/shared/infrastructure/prismaClient.server.ts`
- `src/modules/composition.server.ts`
- `scripts/check-architecture.mjs`
- `scripts/check-architecture.test.mjs`
- `.env.example`
- `docs/architecture/module-boundaries.md`

Tests:

- `npm run prisma:validate`
- `npm run prisma:generate`
- `npm run test:architecture`
- `npm run architecture:check`
- `npm run typecheck`

Rollback:

- RDS helper exists but is unused when flags are off.
- Production remains Firebase-backed.

## PR 2: RDS List Authorization

Status: implemented as an unwired adapter, ready for review.

Tasks:

- `RDS-020`
- `RDS-021`

Files likely touched:

- `src/modules/lists/**`
- `src/modules/groceries/application/listAuthorizationRepository.ts`
- `src/modules/composition.server.ts`
- grocery/receipt/stock authorization tests

Tests:

- authorization adapter tests
- `npm test -- --ci`
- `npm run typecheck`

Rollback:

- Keep existing Firebase/fail-closed authorization wiring active unless flag enables RDS auth.

## PR 3: Grocery RDS Repository And Read API

Status: implemented as unwired repository/service/handler code, ready for staging wiring.

Tasks:

- `RDS-030`
- `RDS-031`
- part of `RDS-034`

Files likely touched:

- `src/modules/groceries/infrastructure/prismaGroceryRepository.server.ts`
- `src/modules/groceries/application/groceryReadRepository.ts`
- `src/modules/groceries/application/getGroceries.service.ts`
- `src/modules/groceries/infrastructure/groceryReadHttp.server.ts`
- `src/routes/api/lists/$listId/groceries.tsx`
- `src/client/api/groceries.ts`

Tests:

- grocery repository tests
- grocery service tests
- grocery HTTP tests
- client API tests
- `npm run typecheck`

Rollback:

- Disable grocery RDS flags.
- Firebase feed/write path remains intact.

## PR 4: Grocery UI RDS Feed And Mutation Refresh

Tasks:

- `RDS-032`
- `RDS-033`
- remaining `RDS-034`

Files likely touched:

- `src/hooks/GroceriesFeedContext.tsx`
- `src/hooks/ListContext.tsx`
- `src/routes/index.tsx`
- grocery UI tests

Tests:

- React Testing Library tests for feed loading/refetch
- relevant grocery component tests
- `npm run typecheck`
- `npm run build`

Rollback:

- Disable grocery read/write flags.
- UI uses Firebase `onValue` path.

## PR 5: Migration Fixture And Normalization Skeleton

Tasks:

- `RDS-041`
- `RDS-042`

Files likely touched:

- `scripts/migration/**`
- fixture files under `scripts/migration/fixtures/**`
- package scripts if needed

Tests:

- fixture transform tests
- `npm test -- --ci`

Rollback:

- Tooling only; no production runtime impact.

## PR 6: Migration Transforms

Tasks:

- `RDS-043`
- `RDS-044`
- `RDS-045`

Files likely touched:

- `scripts/migration/**`
- transform tests

Tests:

- fixture transform tests
- idempotency tests
- decimal/receipt line-item tests

Rollback:

- Tooling only; do not run production import.

## PR 7: Verification Reports

Tasks:

- `RDS-046`

Files likely touched:

- `scripts/migration/**`
- report fixture snapshots or expected JSON

Tests:

- verification report tests
- orphan check tests
- count mismatch tests

Rollback:

- Tooling only; no runtime impact.

## PR 8+: Remaining Domains

Recommended order:

1. categories
2. stock
3. lists/members/invites/config
4. receipts
5. purchase history
6. whats-new
7. feedback/retry
8. n8n machine writes

Each PR must include:

- flag default off in production
- authorization tests
- persistence tests
- rollback note
- staging verification note

## PR Description Template

```md
## Summary

## Tasks

- [ ] RDS-___

## Production Safety

- Production default:
- Feature flag:
- Rollback:
- Data written:

## Authorization

## Verification

## Deferred
```
