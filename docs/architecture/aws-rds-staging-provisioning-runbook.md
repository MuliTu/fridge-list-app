# AWS RDS Staging Provisioning Runbook

This runbook prepares `RDS-010` and the remaining infrastructure part of `GATE-3`.

Do not put AWS credentials, database passwords, connection strings, or secret ARNs in this file.

## Required Inputs

- [ ] AWS account ID
- [ ] AWS region
- [ ] VPC/subnet strategy
- [ ] app runtime network source allowed to connect to RDS
- [ ] staging database name
- [ ] staging app database user name
- [ ] secret storage location for staging `DATABASE_URL`
- [ ] staging RDS owner
- [ ] staging cleanup owner

## Recommended Defaults

- Engine: RDS PostgreSQL
- Public access: disabled
- Storage encryption: enabled
- TLS: required
- Backups: enabled if staging uses production-derived data
- Deletion protection: enabled if staging uses production-derived data, otherwise optional
- Connection pooling: RDS Proxy before production-like traffic

## Provisioning Checklist

- [ ] Create or choose private subnets.
- [ ] Create security group for RDS.
- [ ] Allow inbound PostgreSQL only from approved app/runtime networks.
- [ ] Create RDS PostgreSQL staging instance.
- [ ] Create least-privilege app database user.
- [ ] Store `DATABASE_URL` in server-side staging secrets only.
- [ ] Do not expose `DATABASE_URL` through Vite/browser env vars.
- [ ] Run `npm run prisma:validate`.
- [ ] Run `npm run prisma:generate`.
- [ ] Apply schema/migrations only from reviewed migration commands.
- [ ] Confirm app runtime can connect from staging.
- [ ] Confirm local/browser code cannot access RDS directly.
- [ ] Record endpoint, database name, and secret reference outside the repository.

## RDS Proxy Checklist

- [ ] Create RDS Proxy for staging.
- [ ] Attach the staging RDS instance.
- [ ] Configure proxy auth using approved secret storage.
- [ ] Restrict proxy access to approved runtime networks.
- [ ] Confirm Prisma connection string points to the proxy endpoint where required.
- [ ] Run a connection smoke test from staging runtime.

## Staging Acceptance

Before marking `RDS-010` complete:

- [ ] staging RDS exists
- [ ] staging connection is server-side only
- [ ] Prisma client can connect from staging runtime
- [ ] no browser bundle contains the connection string
- [ ] monitoring is visible to the owner
- [ ] backup policy is set if production-derived data is used

## Evidence To Record

Record these in a private operations note or deployment ticket, not in source control:

- RDS instance identifier
- RDS Proxy identifier, if used
- secret reference
- security group IDs
- subnet group
- staging database name
- owner
- creation date
- cleanup/review date
