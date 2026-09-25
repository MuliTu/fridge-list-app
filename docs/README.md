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
