# Project docs

This folder contains durable project documentation. Keep long-lived architecture
decisions, specs, audits, and implementation plans here instead of hidden root-level
folders, so the repository stays easy to scan.

## Contents

- `architecture/module-boundaries.md` - the enforced dependency rules for routes,
  modules, server-only files, provider SDKs, and browser-safe imports.
- `specs/` - architecture snapshots, target designs, audits, and feature specs.
- `plans/` - implementation plans that are still useful as project history or future
  reference.

## Checks

Run these before changing module boundaries or server/client wiring:

```bash
npm run architecture:check
npm run test:architecture
```

## Flagship readiness planning

Local implementation has started; milestone and release gates remain explicit.

- [Product spec and evidence baseline](specs/spec-flagship-readiness.md)
- [Phased implementation plan](plans/plan-flagship-readiness.md)
- [Reviewable task backlog](specs/tasks-flagship-readiness.md)

These documents distinguish existing code, verified evidence and planned behavior.
Earlier feature specs remain useful historical inputs.

- [Execution evidence and task status](plans/flagship-progress.md)
- [Isolated demo setup status](demo-setup.md)

- [External remediation and endpoint configuration proposal](plans/external-remediation-proposal.md)
