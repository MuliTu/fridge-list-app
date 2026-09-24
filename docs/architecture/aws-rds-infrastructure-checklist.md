# AWS RDS Infrastructure Checklist

This checklist prepares `RDS-010`, `RDS-011`, and `RDS-070`.

## Staging RDS

- [ ] Create staging RDS PostgreSQL instance.
- [ ] Use private networking where possible.
- [ ] Restrict inbound access to approved app/runtime networks.
- [ ] Require TLS.
- [ ] Create app database.
- [ ] Create least-privilege app user.
- [ ] Store staging `DATABASE_URL` in staging server environment only.
- [ ] Do not expose `DATABASE_URL` to Vite/browser env vars.
- [ ] Enable automated backups if staging contains production-derived data.
- [ ] Tag resources with project, environment, owner, and migration.

## Production RDS

- [ ] Create production RDS PostgreSQL instance.
- [ ] Enable encryption at rest.
- [ ] Enable automated backups.
- [ ] Enable point-in-time recovery.
- [ ] Define backup retention.
- [ ] Define maintenance window.
- [ ] Define deletion protection policy.
- [ ] Create least-privilege app user.
- [ ] Create migration/import user if separate.
- [ ] Configure monitoring and alarms.
- [ ] Document manual snapshot procedure.
- [ ] Document restore procedure.
- [ ] Run staging restore/PITR drill.
- [ ] Record production restore owner.
- [ ] Define RTO and RPO.
- [ ] Document endpoint/secret switchback instructions for restored databases.

## Connection Pooling Decision

Choose one:

- [ ] RDS Proxy
- [ ] Prisma Accelerate
- [ ] PgBouncer-compatible pooling
- [ ] non-serverless runtime
- [ ] other approved option

Decision criteria:

- serverless connection limit safety
- Prisma compatibility
- transaction compatibility
- operational ownership
- latency
- cost
- local/staging parity

No production RDS traffic should start until this decision is made.

## Secrets

- [ ] `DATABASE_URL` exists only in server-side secret storage.
- [ ] no database secrets in `.env.example` beyond placeholder examples.
- [ ] no database secrets in logs.
- [ ] no database secrets in client config.
- [ ] rotation process documented.

## Monitoring

Monitor:

- CPU
- memory
- storage
- connections
- connection pool saturation
- slow queries
- deadlocks
- failed logins
- read/write latency
- backup failures

Thresholds to define before production cutover:

- [ ] CPU warning/critical thresholds
- [ ] memory/freeable-memory thresholds
- [ ] storage remaining threshold
- [ ] connection utilization threshold
- [ ] connection pool saturation threshold
- [ ] slow query threshold
- [ ] failed login threshold
- [ ] p95/p99 read/write latency thresholds
- [ ] application error-rate threshold
- [ ] dashboard links and alert owners for each metric

Application logs should track:

- selected data source
- authorization failures
- query failures
- migration import failures
- feature flag state at startup

## Production Cutover Infrastructure Gate

Before `RDS-073`:

- [ ] production RDS exists
- [ ] backups enabled
- [ ] manual snapshot taken after import
- [ ] restore procedure tested or explicitly accepted with named approver
- [ ] PITR timestamp captured for cutover
- [ ] connection pooling configured
- [ ] app can connect from production runtime
- [ ] import user access removed or restricted after migration
- [ ] monitoring owner assigned
