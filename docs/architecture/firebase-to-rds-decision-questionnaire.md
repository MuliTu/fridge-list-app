# Firebase to RDS Decision Questionnaire

Use this to answer open migration questions. Each question has three options:

- Option A is the recommended default.
- Option C is always open chat for nuance or a custom answer.

## GATE-1 Questions

### Q1: Which database engine should we use?

- [ ] Option A (Recommended): AWS RDS PostgreSQL, matching the current Prisma schema.
- [ ] Option B: Another AWS relational engine.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-001`, `RDS-010`

### Q2: What connection pooling strategy should we use?

- [ ] Option A (Recommended): RDS Proxy for production, with staging configured as close to production as practical.
- [ ] Option B: Prisma Accelerate or another Prisma-compatible pooling service.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-002`, `RDS-011`, production traffic

### Q3: What should replace Firebase realtime in phase 1?

- [ ] Option A (Recommended): HTTP reads, refetch after mutation, refetch-on-focus, short polling for critical screens.
- [ ] Option B: Build SSE/WebSockets before enabling RDS-backed user flows.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-003`, `RDS-033`

### Q4: What should happen to Firestore image storage in phase 1?

- [ ] Option A (Recommended): Keep Firestore images temporarily; migrate images to S3 later.
- [ ] Option B: Migrate receipt/grocery images to S3 during the RDS cutover.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-004`, receipt/image planning

### Q5: What ID strategy should backfill use?

- [ ] Option A (Recommended): Preserve Firebase IDs during backfill where practical; use UUIDs for new RDS-only records.
- [ ] Option B: Generate all-new RDS IDs and maintain a mapping table.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-005`, migration transforms

### Q6: Where should Firebase backups be saved?

- [ ] Option A (Recommended): Encrypted, versioned, private S3 bucket in the production AWS account.
- [ ] Option B: Encrypted, versioned, private S3 bucket in a separate backup/security AWS account.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-006`, `RDS-040`, `RDS-041`

### Q7: How long should the rollback window be?

- [ ] Option A (Recommended): 7 days after production cutover.
- [ ] Option B: 14 days after production cutover.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-007`, `RDS-074`, cleanup

### Q8: What should the production cutover write policy be?

- [ ] Option A (Recommended): Short write freeze during final export/import/cutover, unless rehearsal proves this is too disruptive.
- [ ] Option B: Build dual-write and reconciliation before production cutover.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-008`, `RDS-073`

## GATE-2 Questions

### Q9: Should pending members have list-data access?

- [ ] Option A (Recommended): No. Follow production Firebase rules: approved members only.
- [ ] Option B: Yes. Treat pending members as readable members and update authorization/product docs accordingly.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-009`, authorization tests

### Q10: How should older Firebase roots get owner identity?

- [ ] Option A (Recommended): Use `ownerUid`/`normalizedOwnerEmail` when present; recover from identity bindings only when deterministic; otherwise block migration for that list.
- [ ] Option B: Derive owner identity from sanitized email path whenever possible, even if UID is missing.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-010`, list transform

### Q11: What is the source of truth for `IdentityBinding`?

- [ ] Option A (Recommended): Use Firebase `/identityBindings` when present; otherwise derive only from verified Auth/export source.
- [ ] Option B: Derive from list owner/member emails without Auth verification.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-011`, authorization adapter

### Q12: How should feedback records migrate?

- [ ] Option A (Recommended): Verify production feedback rules/data shape before enabling RDS feedback path; migrate submit and retry together.
- [ ] Option B: Defer feedback migration entirely until after core list domains are on RDS.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-012`, feedback migration

### Q13: Where should receipt price history be computed in phase 1?

- [ ] Option A (Recommended): Keep client-computed from receipt reads in phase 1.
- [ ] Option B: Move price history aggregation server-side during receipt migration.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-013`, receipt design

### Q14: How should anonymous Firebase Auth be handled?

- [ ] Option A (Recommended): Extend token verification to expose sign-in provider and reject anonymous users server-side.
- [ ] Option B: Document and verify that anonymous auth is disabled in production, without adding provider to principal.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-014`, authorization tests

## Infrastructure Ownership Questions

### Q15: Who owns staging RDS?

- [ ] Option A (Recommended): Engineering/platform owner responsible for provisioning and access.
- [ ] Option B: Application engineering owner provisions it directly.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-015`, `RDS-010`

### Q16: Who operates production export/import?

- [ ] Option A (Recommended): Named database/platform operator runs export/import with a cutover lead present.
- [ ] Option B: Application engineer runs export/import.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-017`, `RDS-041`, `RDS-073`

### Q17: Who owns production monitoring during cutover?

- [ ] Option A (Recommended): Named monitoring/on-call owner separate from the import operator.
- [ ] Option B: Cutover lead also owns monitoring.
- [ ] Option C: Open chat / custom answer.

Blocks: `DEC-018`, `RDS-073`, `RDS-074`

## How To Answer

Reply with the option letters, for example:

```text
Q1 A, Q2 A, Q3 A, Q4 A, Q5 A, Q6 B, Q7 A, Q8 A
Q9 A, Q10 A, Q11 A, Q12 B, Q13 A, Q14 A
Q15 A, Q16 A, Q17 A
```

If you choose `C`, include the custom answer after the question number.
