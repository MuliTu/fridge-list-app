# Firebase to RDS ADRs

These architecture decision records are proposed. They become accepted only after `GATE-1` sign-off.

## ADR-001: Use AWS RDS PostgreSQL As The Relational Store

Status: proposed

Decision:

Use AWS RDS PostgreSQL as the relational database for primary application data.

Context:

- `prisma/schema.prisma` already targets PostgreSQL.
- The app needs relational ownership, membership, receipt line items, and verification-friendly migration tables.
- RDS gives managed backups, snapshots, monitoring, and point-in-time recovery.

Consequences:

- Prisma becomes the server-side database access layer.
- RDS access must be server-only.
- Production deployment needs a connection pooling strategy.
- Firebase Auth can remain independent from the data store.

Rejected alternatives:

- Keep Firebase Realtime Database: avoids migration but leaves current direct-browser database model and rule complexity.
- DynamoDB: viable on AWS, but current Prisma schema and relational access needs point toward PostgreSQL.
- Self-managed PostgreSQL: more operational burden than RDS.

## ADR-002: Keep Firebase Auth In Phase 1

Status: proposed

Decision:

Keep Firebase Auth for sign-in and ID tokens during the database migration.

Context:

- Current UI and server routes already use Firebase Auth.
- Replacing auth and database together would multiply migration risk.
- The app is live in production.

Consequences:

- Server routes continue verifying Firebase ID tokens.
- RDS authorization maps Firebase UID/email into `HouseholdList`, `HouseholdMember`, and `IdentityBinding`.
- Anonymous auth/provider behavior must be explicitly handled before cutover.

Rejected alternatives:

- Move to Cognito during the database migration: too much scope for phase 1.
- Custom auth/session system: unnecessary and riskier.

## ADR-003: Keep Firestore Image Storage Out Of Phase 1

Status: proposed

Decision:

Keep receipt and grocery image documents in Firestore during the first RDS migration phase.

Context:

- Firestore images are not part of Firebase Realtime Database.
- Moving images to S3 is useful, but not required to prove the primary data migration.
- Receipt/grocery image refs must survive the migration.

Consequences:

- RDS records can keep `imageRef`/`imageUrl`.
- Firestore image backup is still required before Firebase cleanup.
- S3 migration becomes a separate storage project.

Rejected alternatives:

- Move images to S3 in the same cutover: increases blast radius.
- Drop old images: unacceptable data loss.

## ADR-004: Use Server-Owned APIs Instead Of Direct Browser Database Access

Status: proposed

Decision:

All RDS reads and writes go through authenticated server routes, application services, and server-only infrastructure repositories.

Context:

- Browsers cannot safely connect directly to RDS.
- Firebase rules currently enforce read/write permissions.
- RDS authorization must happen before Prisma queries/mutations.

Consequences:

- Current `onValue` reads need HTTP/SSE/WebSocket replacements.
- Client write helpers move to API clients.
- Server tests must cover authorization before persistence.

Rejected alternatives:

- Direct browser SQL/RDS access: unsafe and invalid for this app.
- Push all logic into routes: violates existing module boundaries and makes authorization harder to test.

## ADR-005: Start With HTTP Refetch/Polling For Realtime Replacement

Status: proposed

Decision:

Phase 1 replaces Firebase realtime subscriptions with authenticated HTTP reads, mutation invalidation, refetch-on-focus, and short polling for critical screens. SSE/WebSockets are deferred until proven necessary.

Context:

- Firebase `onValue` powers groceries, list discovery, categories, stock, receipts, purchase insights, whats-new, and member modals.
- The first migration goal is data safety and authorization correctness.
- SSE/WebSockets add operational complexity.

Consequences:

- Cross-device updates may become slightly less immediate in phase 1.
- Local writes should still refresh immediately.
- Critical screens can poll; low-risk screens can fetch on open.

Rejected alternatives:

- Build WebSockets first: larger scope before the data migration is proven.
- No refresh strategy: stale UI risk is too high.

## ADR-006: Preserve Firebase IDs During Backfill Where Practical

Status: proposed

Decision:

Preserve Firebase push keys as RDS primary IDs during migration where they represent existing records. Use generated UUIDs for new RDS-only records after cutover.

Context:

- Existing client models expose `key`.
- Receipt/image refs and verification reports benefit from stable old IDs.
- Rollback comparison is easier when IDs match.

Consequences:

- Import scripts must support externally supplied IDs.
- New post-cutover rows can use UUIDs.
- Some deterministic IDs remain for idempotent integrations.

Rejected alternatives:

- Generate all-new IDs during backfill: increases mapping and verification complexity.
- Keep email-derived IDs forever for lists: may preserve compatibility, but canonical RDS IDs should be explicit and documented.

## ADR-007: Use Short Write Freeze Unless Rehearsal Requires Dual-Write

Status: proposed

Decision:

Default to a short production write freeze during final export/import/cutover. Use dual-write only if rehearsal shows the freeze is too disruptive.

Context:

- Dual-write adds data divergence and rollback complexity.
- App traffic appears suitable for a controlled migration window, but this must be confirmed.
- Production safety matters more than zero-downtime elegance for this migration.

Consequences:

- Need user/admin communication if write freeze is user-visible.
- Final Firebase export is simpler.
- RDS import verification is cleaner.

Rejected alternatives:

- Dual-write by default: higher implementation and reconciliation risk.
- No freeze and no dual-write: likely data loss during cutover.

## ADR-008: Follow Production Firebase Rules For Pending Members

Status: proposed

Decision:

Pending invites/members do not receive list data access in RDS unless product explicitly changes the rule.

Context:

- Firebase production rules require approved member status for list data reads.
- Some UI comments suggest pending membership may have historically granted access.
- Migration should preserve production enforcement, not comments.

Consequences:

- Pending members can see/approve their invitation only through scoped invite endpoints.
- List data access begins after approval.
- Tests must include pending denial.

Rejected alternatives:

- Let pending members access list data: conflicts with current Firebase rules.
- Drop pending state: breaks invite workflow.
