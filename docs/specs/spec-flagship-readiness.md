# Spec: Fridge flagship readiness

Status: Local implementation authorized on 2026-10-05; milestone decisions remain reviewable. No external release authorized.
Progress: [Execution evidence](../plans/flagship-progress.md)
Date: 2026-10-05
Plan: [Implementation plan](../plans/plan-flagship-readiness.md)
Backlog: [Reviewable tasks](tasks-flagship-readiness.md)

## 1. Purpose and smallest useful scope

Make Fridge a credible portfolio application: a household shopping list with realtime collaboration and a personal chef that suggests meals grounded in purchased, explicitly selected inventory. Demonstrate justified architecture, controlled AI behavior, and an inspectable spec → plan → task → verification trail. Success means a reviewer can reproduce the isolated demo, understand decisions, and observe failure handling without accessing the real household.

Required flagship slice: sign in to an isolated household; add and mark groceries purchased; select purchased items on the main page; generate and review recipes in Hebrew or English; explicitly save one; reload and find it in Recipes. Include a deterministic offline demo with obvious provenance and failure simulation. A bounded list assistant may remain visible only for verified paths; unsupported writes must be disabled with an honest explanation.

Optional after the required slice passes: receipt extraction, richer nutrition, Siri/n8n ingestion, image lookup, ticket creation, habit summaries and broader assistant tools. They are existing code areas or enhancements, not promises of working production features. No new microservices, vector store, autonomous household agent, paid integration or framework migration is needed for this milestone.

## 2. Baseline and evidence limits

This review inspected local branch `main`, HEAD `1606b3a`, package version `2.57.2`. Cached `origin/main` is `0e9256702ea9602c39a52163353e3741664155fd`. `git log HEAD..origin/main` reports `fbd0b9e` and merge `0e92567`: fallback recipe grouping, Hebrew copy and tests in the chef graph (two files, 90 insertions, 24 deletions). Checkout was not changed. `git ls-remote origin refs/heads/main` failed DNS; the cached ref is not a fresh remote attestation. Reconcile those changes in a separately authorized implementation session before touching fallback behavior.

Existing untracked `.claude/Projects.code-workspace` belongs to the user and must be preserved. GitNexus metadata points to `f1a3714`, six commits behind local HEAD. Graph query located chef/guardrail flows, but stale results are navigation hints, not current proof. Refresh before future code changes. Documentation impact returned UNKNOWN; the root README text links to the docs index. No application symbol is changed by this planning set.

| Area | Evidence/state | Verification still needed |
| --- | --- | --- |
| React/TS, TanStack Start, Firebase, modular boundaries | Present in [package](../../package.json) and [boundaries](../architecture/module-boundaries.md) | Typecheck, full tests, build and runtime |
| Chef graph, separate nutrition node and deterministic fallback | Present in [graph](../../src/modules/recipes/infrastructure/langchain/personalChefGraph.ts); upstream fallback delta noted above | Quality, timeout, safety and live provider behavior |
| Purchased-product grounding | [Service](../../src/modules/recipes/application/suggestRecipes.service.ts) re-reads inventory and requires `bought === true`; truncates model input to 20 products with warning | Concurrency, authorization and full UI journey |
| Recipe persistence and access | [Repository](../../src/modules/recipes/infrastructure/firebaseAdminRecipeRepository.server.ts) exists but grants pending/legacy email memberships | Align with [UID rules](../../database.rules.json); negative tests |
| Gemini assistant and optional n8n | Existing routes/modules and README descriptions; supplied audit reports partially unwired/fail-closed commands | Inventory supported paths; receiving-workflow authentication |
| Architecture checker | Re-run here: four violations (three env reads in identity application; `node:crypto` in recipe application) | Repair and checker/fixture pass |
| Setup and documentation | README recommends `serve dist`; no tracked env example; Firebase config has RTDB emulator only | Isolated Auth/Admin/browser wiring and correct server runtime |
| Build, live integration and production | Not validated in this planning session | Explicit future gates; no success claim |

Supplied prior audit, not independently repeated here: public history photo `IMG_2336.jpg` in `c63671e` contains location/capture/device metadata and is absent from main/tags; `CLAUDE.md` exposes personal contact and operational endpoints; `CONVERSATION.md` contains a long personal discussion. Historical scan covered 203 commits/1,677 blobs without finding privileged secret patterns; that is not proof of absence. Do not reproduce private values in planning documents. Treat history remediation separately from working-tree documentation repair.

## 3. Critical journeys and acceptance

| Journey | Required behavior and failure handling |
| --- | --- |
| Open household | Authenticated owner/approved member sees only authorized data. Missing token, revoked/pending membership and other-list identifiers fail closed before database/model access. |
| Maintain inventory | Explicit add/edit/purchased actions persist and sync across two isolated sessions. Failed writes remain visibly failed; retry cannot silently duplicate an item. |
| Ask the chef | Only purchased selected keys are eligible; server retrieves canonical names/quantities. Empty selection explains the next step. Changed/deleted inventory returns conflict and retains selection for correction. Display any 20-product truncation before/with results. |
| Review suggestions | Show ingredients, steps, servings, provenance and limitations; 1–5 valid suggestions or a bounded safe failure. No outside ingredient or implicit pantry assumption. Reject non-food inputs and unsafe generic preparation; a fallback is not automatically safe just because deterministic. |
| Save/reopen | User explicitly chooses Save. Reauthorize at write time, persist one record per operation, keep review open on failure, and retrieve it after reload. Generation alone never writes inventory or recipes. |
| Understand degradation | Provider outage, disabled integration, invalid output and nutrition uncertainty have localized, recoverable states. Demo/fallback output is labeled. No fabricated success, allergy guarantee or medical claim. |

## 4. Trust, privacy and data rules

Browser input, grocery names, receipt text, model output, URLs and workflow replies are untrusted data. Firebase Admin bypasses client rules: each service must enforce authorization, role, list scope and schema before reads/writes. Model text cannot grant access, choose database paths, trigger tools or override system policy.

Target access matrix: owner manages membership and all household actions; approved editor reads, suggests and changes household content; approved viewer reads and may request read-only suggestions but cannot save/change content; pending, revoked, anonymous and unrelated principals are denied. Owner identity is UID; email-derived keys/invites/memberOf are not authorization evidence. Legacy compatibility, if truly required, needs an explicit migration decision and negative tests rather than broad fallback access. Recheck membership on every command; UI hiding is insufficient.

Keep current list-scoped storage (`users/{listId}/...`) until migration is justified. Validate Firebase keys, bounded payloads, recipe schema, role and server-generated metadata. Fetch only selected products and minimal identity/membership nodes rather than the entire household. Preserve approved UID rules; do not loosen client rules to compensate for unwired server commands.

Send the model only necessary selected product fields and bounded preferences/language. Exclude emails, UIDs, receipt images, household history and endpoints unless essential to a separately reviewed feature. Make provider egress visible before first real AI use; exact retention and tracing settings must be verified for the chosen account. Optional integrations default off. Keep keys server-side; public Firebase app config is not privileged authorization. Never copy `.env.local`, tokens or service accounts into fixtures/docs. Strip image metadata from new public assets and use synthetic households/receipts/screenshots.

Workflow ingestion requires an authenticated server boundary plus verified receiving-workflow auth, replay protection, schema limits and scope binding. A URL or claimed person name is not an identity. Until the receiver can be inspected and tested, label the path unverified/disabled in the demo. URL receipt fetching must preserve SSRF protections against private addresses and redirect escapes.

## 5. AI and deterministic responsibilities

AI proposes practical recipe wording and optionally estimates nutrition. Deterministic code handles authentication, inventory retrieval, food eligibility, schemas, ingredient grounding, quantity bounds, role checks, deadlines, output provenance and persistence. Nutrition is a separate best-effort enrichment: missing units/weights yield unknown values, estimates are labeled approximate with basis per serving/whole recipe, and nutrition failure never invalidates an otherwise safe recipe. Existing heuristic estimates need review before presentation as useful numbers.

Proposed request budget (owner decision checkpoint): 30 seconds overall; generation ≤2 model calls including at most one schema/grounding repair; nutrition ≤1 call; graph recursion ≤10; no nested SDK retries that exceed those totals. Deadline cancellation propagates to adapters. Auth/conflict/schema-input errors receive no retry. A timeout either yields a validated safe deterministic fallback within budget or a recoverable failure. Optional image retrieval is off for the required slice. Bound per-principal concurrency and request rate in server composition; establish numeric limits in an isolated cost/latency trial before enabling real AI. Do not assert existing code already meets these targets.

Every write uses an operation ID scoped to principal/list/action and a canonical payload fingerprint. Atomically claim and complete it with the record mutation; same payload replays the original result, different payload returns conflict, concurrent requests create one result. Proposed replay window: 24 hours; failure before persistence is retryable, timeout after persistence is recoverable by operation lookup. Durable transactions are preferable to an in-memory cache for serverless retries. Approve retention and exact transaction path before implementation. An operation ID is not authorization. Inventory snapshot/version changes trigger explicit conflict; suggestions never consume stock automatically.

## 6. Architecture decisions and tradeoffs

| Decision | Rationale and tradeoff |
| --- | --- |
| Keep modular monolith and existing Start routes | Small deployable app, clear domain/application/infrastructure boundaries; avoid distributed operational cost. Repair boundaries incrementally rather than replacing the app. |
| Inject config, clock/run ID and provider ports at server composition | Deterministic tests and browser-safe application services; slightly more explicit constructor wiring. |
| Exact structured inventory retrieval, no vector store | Small household datasets need authoritative keys and current state, not approximate retrieval. Revisit only for a measured catalog/document retrieval need. |
| Retain bounded LangGraph for chef generation → validation → nutrition | Makes stages/failures inspectable; orchestration is justified only while each stage has a real contract and evaluation. Avoid persistent autonomous checkpoints. |
| Server-authoritative commands, realtime authorized reads | Admin writes centralize validation; duplicate client/server auth policy must be tested for parity. Migrate only paths required for the demo first. |
| Fake adapters + isolated emulator demo | Reproducibility and fault injection without household exposure/cost; explicitly separate fake capability from real provider evidence. |

This readiness spec governs the flagship milestone. Older [chef spec](spec-personal-chef-agent.md), [chef plan](plan-personal-chef-agent.md) and [chef tasks](tasks-personal-chef-agent.md) remain historical inputs, not a fresh completeness checklist. Their historical pantry assumptions are superseded by the selected-products-only rule here; their links and precedence notices have been updated.

## 7. AI evaluation contract

Create a versioned synthetic suite of at least 30 cases split across Hebrew/English: normal meals, one ingredient, unsupported/non-food items, missing quantity/unit, raw animal products, empty/stale inventory, duplicate names, unselected pantry requests, allergy preferences, prompt injection in names/preferences, malformed/oversized output, timeout and provider outage. Store fixture IDs, rubric, prompt/model versions, run date and aggregate results without real household payloads.

Mandatory deterministic gates: all cases enforce authorization before provider calls; zero cross-household leakage, writes without confirmation, unselected ingredients or accepted invalid output; call/deadline caps hold under fault injection; nutrition failure preserves valid suggestions and unknowns remain unknown. Golden tests assert invariants, not exact generated prose.

For real-provider trial: at least 20 eligible recipe cases, two runs each; require ≥90% pass on a recorded human rubric (practical/coherent, language, instructions, preferences) and zero critical safety/grounding failures. Human review of safety-sensitive cases is mandatory; use authoritative food-safety guidance during implementation. LLM-as-judge may assist but cannot certify safety. Record first-pass validity, repair/fallback rates, nutrition coverage, p50/p95 latency and token/cost totals when available. No measured performance numbers yet. A failed critical case blocks real-AI demo readiness regardless of aggregate score.

## 8. Reproducibility, UX and observability

Deliver an env example with placeholders, a field-by-field client/server config table and validated startup errors. Default to synthetic fixtures/fake models and isolated Auth + RTDB emulators. Browser SDK, Admin SDK and ID-token verifier must all point to the same isolated project; fail startup if demo mode resolves live Firebase. Do not use the current dev auth bypass as security evidence. Fresh clone procedure must include Node requirement, locked install, emulator prerequisites/commands, seed/reset commands, dev/test steps and teardown. Document the actual Start server deployment artifact; static `serve dist` cannot demonstrate server API routes. Review build-time Firebase initialization before running a build against any live environment.

Hebrew RTL and English LTR: logical spacing, correct mixed numbers/units, translated errors, narrow phone (360px), tablet and desktop; 200% zoom; labeled controls, visible focus, keyboard-only modal navigation, focus restoration, screen-reader status announcements and adequate contrast. Preserve entered preferences/selection across retry; loading has cancellation and does not announce success prematurely.

Observability uses opaque request/run IDs, stage, duration, model/prompt version, error code, retry/fallback count and aggregate token usage. Exclude names, list IDs, emails, preferences, prompts, recipes, receipts and tokens from routine logs/traces. Sanitize error causes and client logs, document tracing defaults, proposed seven-day operational-log retention and access control, and verify redaction with injected sentinel values. No raw provider tracing by default. Owner approves retention before deployment.

README/demo package should lead with the flagship journey, honest capability matrix, current architecture, isolated quickstart, evaluation methodology/results, known limitations, and links to spec/plan/tasks. A short synthetic Hebrew/English demo shows generation, explicit save and one outage recovery; record date/commit/mode and never imply production validation. Screenshots have no real household identifiers or image metadata.

## 9. Decisions, risks and authorization

Owner review checkpoints: (A) required scope, selected-products-only rule and access matrix; (B) legacy membership strategy, deadline/call/retention budgets and nutrition display; (C) evidence and demo narrative before release. Each task should end with a small diff, proof and a short explanation the owner can challenge. Owner should explain one tradeoff and review one failure case per phase; AI assistance must leave understandable decisions, not a bulk rewrite.

Safe candidate next work, only after implementation authorization: local docs/env placeholders, isolated fixtures, auth parity fixes, config injection, bounded chef behavior, idempotent save, focused UI and meaningful tests. The 2026-10-05 instruction to create a branch and start tasks authorizes local implementation; external actions still require separate approval.

Separate explicit approvals: public-history rewrite/removal (photo metadata and private discussion), credential rotation/revocation if exposure is confirmed, production data/rule changes or migrations, deployment/public demo publishing, paid services and external messages. Prepare a concrete impact/rollback proposal before asking for those approvals. History removal cannot guarantee removal from clones/caches; do not claim it does. No privileged credential was established as leaked by the supplied scan, so rotation is not an automatic planning action.

Open risks: cached remote may have changed; stale graph; Admin auth mismatch; legacy household data and partially unwired writes; unsafe deterministic fallback; inaccurate nutrition; build opening live connections; unsupported setup; unknown workflow receiver security/provider retention; maintenance burden of multiple stale docs. These are readiness blockers until their relevant gates pass, not reasons to expand into a platform rewrite.
