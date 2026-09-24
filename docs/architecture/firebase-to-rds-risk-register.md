# Firebase to RDS Risk Register

This register tracks migration risks and mitigations.

## Severity Legend

- `High`: can cause production outage, data loss, authorization breach, or failed rollback.
- `Medium`: can cause user-visible degradation, migration delay, or manual recovery.
- `Low`: contained inconvenience or documentation/process risk.

## Risks

| ID | Risk | Severity | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| `RISK-001` | RDS credentials or Prisma client leak into browser bundle | High | server-only modules, architecture checks, production safety validation | Engineering |
| `RISK-002` | Unauthorized user can access another list after migration | High | RDS authorization adapter, approved-member tests, owner-only tests | Engineering |
| `RISK-003` | Pending invite/member gets list access unintentionally | High | accept `DEC-009`, add pending denial tests | Product/engineering |
| `RISK-004` | Firebase export backup is incomplete or missing before cutover | High | export procedure, S3 checksums, metadata, hard precondition | Platform/operator |
| `RISK-005` | RDS import loses or duplicates data | High | fixture tests, idempotent transforms, verification reports | Engineering |
| `RISK-006` | Serverless RDS connections saturate | High | connection pooling decision before production traffic | Platform |
| `RISK-007` | Rollback path unavailable after RDS cutover | High | flags default off, rollback runbook, Firebase untouched through rollback window | Cutover lead |
| `RISK-008` | Firebase IDs remapped incorrectly and image/receipt refs break | Medium | preserve Firebase IDs during backfill where practical | Engineering |
| `RISK-009` | Firestore images overlooked during Firebase cleanup | Medium | defer image migration explicitly, export Firestore image collections | Engineering |
| `RISK-010` | Realtime UX regresses after replacing `onValue` | Medium | refetch after mutation, polling for critical screens, staging smoke tests | Product/engineering |
| `RISK-011` | Receipt decimal values import inaccurately | Medium | decimal-safe transform and verification | Engineering |
| `RISK-012` | `@updatedAt` overwrites historical timestamps after import | Medium | transform/import tests and documented historical timestamp expectations | Engineering |
| `RISK-013` | Feedback retry path diverges between Firebase and RDS | Medium | migrate submit/retry together or keep Firebase path until complete | Engineering |
| `RISK-014` | n8n machine writes bypass user authorization assumptions | Medium | preserve machine authenticator scopes and allowed-list checks | Engineering |
| `RISK-015` | Write freeze disrupts users | Medium | communication plan, rehearsal timing, dual-write fallback decision | Product |
| `RISK-016` | Production export accidentally committed to repo | High | runbook says never commit exports; use ignored/local/secure S3 paths only | Operator |
| `RISK-017` | Staging test uses production data without approval | High | staging rehearsal input rules and approved backup location | Platform/operator |
| `RISK-018` | Migration code runs against production unintentionally | High | explicit flags, migration tooling enable flag, separate credentials | Engineering |

## Current Highest Risks

Before implementation:

- `RISK-001`: prevent server/client boundary leaks.
- `RISK-002`: get authorization adapter right before any RDS path.
- `RISK-004`: define backup bucket and export ownership.
- `RISK-006`: choose connection pooling.
- `RISK-007`: preserve rollback path.

## Risk Review Checklist

Before `GATE-1`:

- [ ] connection pooling decision accepted
- [ ] backup ownership accepted
- [ ] rollback policy accepted

Before `GATE-2`:

- [ ] pending member behavior accepted
- [ ] owner identity source accepted
- [ ] anonymous auth handling accepted

Before production cutover:

- [ ] all high risks have active mitigations
- [ ] rollback runbook tested
- [ ] verification report clean
- [ ] backup export verified
