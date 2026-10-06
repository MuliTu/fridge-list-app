# Fridge

A Hebrew/English household grocery app with inventory-grounded recipe suggestions.
Built with React, TypeScript, TanStack Start, Firebase and a LangGraph recipe workflow.

The flagship journey is deliberately small: manage a shared grocery list, mark items
purchased, select available ingredients, review suggestions, then explicitly save a
recipe. AI proposes content; deterministic code enforces access, selected inventory,
output shape, time budgets and idempotent persistence.

## Try the isolated demo

Follow the [verified setup guide](docs/demo-setup.md) for prerequisites, synthetic
configuration, local Firebase emulators, seeding and startup. It uses curated offline
recipes without provider credentials or real household data. Do not substitute a
personal Firebase project for the demo project.

The isolated build uses `npm run demo:build` and writes ignored `dist-demo/` artifacts.
TanStack Start API features require a server runtime; serving a static `dist/` folder
is insufficient. Production runtime and deployment validation remain open.

## What is verified

| Capability | Evidence and limits |
| --- | --- |
| Grocery commands and household roles | Local API/emulator role and replay checks pass; complete browser journey pending |
| Recipe grounding and bounded generation | Local guards, deadlines and synthetic evaluations pass; live-model quality unverified |
| Explicit recipe save | Atomic replay/conflict and scoped draft recovery tests pass; full browser reload/sign-out check pending |
| Nutrition | Unknown stays unknown; enrichment is opt-in with weights and provenance; live accuracy unverified |
| Siri/n8n, receipts, assistant, feedback | Existing optional code; disabled in isolated demo and not production-validated here |
| Build and setup | Isolated build and clean-install working-tree snapshot pass; not a fresh clone of published changes |
| Accessibility and release | Full Hebrew/English, responsive, keyboard and browser e2e gates remain open |

See [dated verification evidence](docs/plans/flagship-progress.md) and
[remaining tasks](docs/specs/tasks-flagship-readiness.md). Local tests do not establish
production readiness. Current changes have not been published.

## Architecture and tradeoffs

Server module contracts separate application behavior from Firebase/provider adapters.
Browser-safe exports live in module `index.ts` files; server composition uses `server.ts`.
Firebase Admin authorization checks approved UID membership independently of client rules.

The recipe graph uses bounded selected inventory, rather than a vector database: exact
household records are sufficient for this scope. Nutrition is a separate optional step.
Real-provider failure is recoverable; offline suggestions are explicitly curated.
Recipe saves bind an operation ID to the actor, list and validated payload in one atomic
record. See the [save decision](docs/plans/recipe-save-idempotency-decision.md) and
[fallback decision](docs/plans/chef-fallback-decision.md) for tradeoffs and limitations.

## Development map

| Location | Responsibility |
| --- | --- |
| `src/routes/` | Pages and API adapters |
| `src/modules/` | Feature contracts, application services and infrastructure |
| `src/client/api/` | Same-origin browser API clients |
| `src/components/`, `src/hooks/` | UI, contexts and feature hooks |
| `src/i18n/` | Hebrew and English translations |
| `scripts/` | Isolated setup, build and architecture checks |
| `docs/` | Specs, plans, decisions and verification evidence |

Start with the [contributor guide](CLAUDE.md) and [documentation index](docs/README.md).
The [spec](docs/specs/spec-flagship-readiness.md) leads to a
[phased plan](docs/plans/plan-flagship-readiness.md) and
[small reviewable tasks](docs/specs/tasks-flagship-readiness.md).
Optional webhook configuration and separate approval gates are documented in the
[external remediation proposal](docs/plans/external-remediation-proposal.md).
