# Tasks: Fridge flagship readiness

Status: Local execution started on `codex/flagship-readiness`; external actions remain approval-gated.
Progress: [Execution evidence](../plans/flagship-progress.md)
Spec: [Flagship readiness](spec-flagship-readiness.md)
Plan: [Implementation plan](../plans/plan-flagship-readiness.md)

Each task is intended as a small diff. Split it before work if its contract cannot be reviewed coherently. “Acceptance” below means future evidence required, not a claim of completion. Global precondition: owner authorizes implementation, isolation is established before runtime checks, and refreshed GitNexus impact precedes symbol edits. Do not modify real household data.

## Current gate summary (2026-10-05)

| Task | Evidence-backed state / remaining work |
| --- | --- |
| FR-001 | Baseline recorded; remote main unchanged at last read; upstream reconciliation open |
| FR-002 | Save retention and fallback decisions approved; no production migration approval |
| FR-003 | Isolated setup, emulator/API, clean-install snapshot and build verified; full browser gate open |
| FR-004 | UID/role authorization locally verified; production rules/data unverified |
| FR-005 | Architecture checker clean; optional chef port extraction remains |
| FR-006 | Grocery command/API checks pass; complete browser journey open |
| FR-007 | Grounding/deadlines/offline behavior tested; real-model evaluation absent |
| FR-008 | Unknown/estimate contract tested; live accuracy and full bilingual UI unverified |
| FR-009 | Atomic save/replay and draft recovery tests pass; browser reload/sign-out pending |
| FR-010 | Blocked by browser tool URL policy; earlier hydration/onboarding findings unresolved |
| FR-011 | 30 offline admission cases pass; broader quality and complete diagnostics sentinel review open |
| FR-012 | Current docs/privacy cleanup and endpoint configuration implemented locally; full demo/release gates open |
| FR-013 | [Reviewable external proposal](../plans/external-remediation-proposal.md) prepared; no execution |
| FR-014 | Future action requires scope-specific approval |

Browser access policy is the current tooling blocker. Remaining local diagnostics and
review tasks can proceed independently. Live-provider quality, production migration,
optional workflows and deployment require separate scope/approval; they are not implied
by passing local checks. No full portfolio-readiness claim is made.

## FR-001: Record exact baseline and upstream decision

Dependencies: none. Scope: read-only Git comparison and feature evidence notes.
Acceptance: record local/remote SHAs with fetch/read time; distinguish fresh remote from cached evidence; inspect upstream chef fallback/test delta without changing checkout; preserve workspace edit; list implemented/unverified/planned features. Owner chooses when/how to reconcile the two known upstream commits in a later authorized Git operation.
Verification: Git log/diff/status and source links; no reset/pull or upstream integration. The readiness branch was explicitly requested. Capture index freshness.

## FR-002: Review milestone decisions

Dependencies: FR-001. Scope: owner-reviewed spec decisions.
Acceptance: record required scope, UID/role matrix, no unselected pantry items, fallback safety behavior, nutrition labeling, request/call budgets and optional integration defaults. Owner explains one architecture tradeoff; unresolved migration choices remain explicitly blocked.
Verification: decision record linked to this spec; no implied code/release approval.

## FR-003: Build reproducible isolated setup

Execution split:

- FR-003a: synthetic configuration template + file-only preflight and negative tests — complete locally.
- FR-003b: browser/Admin/token verifier wiring and optional API disabling — locally verified.
- FR-003c: local emulator/seed/API smoke and browser owner/reload verified; clean-install working-tree snapshot, isolated build and typecheck verified; full UI and G1 review pending.

See [setup status](../demo-setup.md). Preflight success does not satisfy G1.

Dependencies: FR-002. Likely areas: env example, Firebase config, SDK composition, seed tooling, setup guide.
Acceptance: placeholder-only config table; synthetic Auth/RTDB project; browser/Admin/verifier wired to it; startup fails if demo config targets live services; fake AI and disabled n8n/images default; deterministic seed/reset; clean clone instructions work without privileged credentials. Review prerender initialization before any build. Existing dev bypass cannot replace auth tests.
Verification: two seeded authenticated users, separate household access, fresh install/dev smoke, egress observation and configuration negative tests. Document actual prerequisites and commands after proving them.

## FR-004: Align recipe authorization with UID rules

Status: implemented and verified locally (repository cases plus real Auth/RTDB/API role matrix); legacy cloud-data migration remains outside this task.

Dependencies: FR-003. Likely areas: recipe authorization repository, shared authorization contract, rule/service tests.
Acceptance: owner/approved UID members only; pending/revoked/email-only/memberOf-only/anonymous/other-list denied; viewer read/suggest permitted but save denied; membership rechecked on writes. Read minimal membership nodes. Legacy data handling is documented without silently widening access.
Verification: table-driven repository/API tests and actual Auth/RTDB emulator rule tests for owner/editor/viewer/pending/revoked/outsider. Invalid/missing token rejected before repository/model call. No deployment of rules in this task.

## FR-005: Repair observed architecture violations

Status: implemented; checker reports zero violations, fixture tests and local regression pass. The existing chef service → graph infrastructure dependency needs a separate port extraction; zero checker violations does not establish complete dependency inversion.

Dependencies: FR-003. Likely areas: identity config/server composition; recipe run-ID injection.
Acceptance: remove application env reads through typed validated injected config; move Node-specific run-ID creation to server composition; preserve explicit development-only behavior and production fail-closed auth. Inspect any inward application → infrastructure coupling and propose a separate small port task if needed rather than hiding it.
Verification: checker reports zero violations; checker fixtures and affected identity/recipe tests/typecheck pass; browser bundle cannot expose server configuration. No gratuitous module restructuring.

## FR-006: Make required grocery commands honest and usable

Status: local server/API slice implemented and verified with owner/editor/viewer identities; browser journey is blocked by browser policy. Replay is scoped to a live item and current client instance; durable replay after deletion/reload is not claimed. Image operations fail clearly; receipt and assistant APIs remain disabled in demo.

Dependencies: FR-004, FR-005. Scope: trace main-page add/edit/purchased path to trusted command repositories; inventory all optional receipt/assistant commands.
Acceptance: required command path authenticates, authorizes role, validates and persists to the isolated household; repeated add operation does not duplicate; realtime read reflects success. Each unsupported optional path visibly disables action or returns clear failure. Do not relax Firebase rules to make direct client writes work.
Verification: service/API tests for success/denial/conflict/upstream failure and two-session emulator journey. Separate any receipt implementation into an optional task; code existence is not “working.”

## FR-007: Bound and ground recipe generation

Status: full HTTP deadline/cancellation, zero provider retries, empty pantry context, authoritative ingredient-key binding and conservative ingredient-name matching implemented. Known non-food categories are rejected on the server. Approved behavior: real-provider failure is recoverable; offline demo accepts only curated salad vegetables. Broader real-model safety evaluation remains unverified.

Dependencies: FR-004, FR-005, FR-006. Likely areas: chef schemas/service/graph/provider adapters.
Acceptance: authoritative bought-product lookup; clear selection-cap warning; ingredient-key grounding; reject non-food/unsafe inputs; no implicit pantry products. Propagate overall deadline/cancellation; ≤2 generation calls including repair, ≤1 nutrition call and bounded graph steps. Invalid output/timeout gives safe labeled fallback or recoverable error; nested retries cannot exceed total budget. Preserve input on failure.
Verification: fake-adapter tests for prompt injection, malformed/oversized output, unmatched ingredients, stale inventory, timeout and call counts; upstream fallback delta accounted for. Human safety review of raw-food/non-food fallback cases.

## FR-008: Make nutrition an honest optional estimate

Status: fabricated deterministic numbers removed; unknown/error results keep nulls. Model enrichment is opt-in, requires explicit positive weights, and validates recipe IDs. Source/basis metadata and bilingual unknown/approximate labels are implemented with unit/component tests. Live nutrition accuracy and full bilingual UI validation remain unverified.

Dependencies: FR-007. Scope: separate nutrition output and display contract.
Acceptance: estimate source/basis recorded, clearly approximate; unknown weight/unit does not manufacture precision; unavailable enrichment preserves valid recipes; no medical or allergy-safety guarantee. Review deterministic heuristics and hide unsupported estimates.
Verification: missing/ambiguous units, estimator error, wrong recipe ID, invalid/out-of-range numbers and serving conversion cases; UI unknown/approximate states in both languages.

## FR-009: Make explicit recipe save idempotent

Status: [storage/retention decision](../plans/recipe-save-idempotency-decision.md) approved and implemented. Atomic same-record metadata, concurrent replay/conflict checks and browser-scoped pending save recovery are tested. Full browser reload/sign-out journey remains blocked by browser URL policy; local storage/API tests are not claimed as browser validation.

Dependencies: FR-004, FR-007, FR-008. Scope: save service/repository/API/UI retry contract.
Acceptance: explicit save only; reauthorize role; stable operation ID/list/principal/payload binding; same operation returns same record; different payload conflicts; concurrent duplicate creates one record. Atomic persistence/operation state and approved expiry; failure after write can recover. User may intentionally save a different operation.
Verification: concurrent replay, timeout-after-write, permission revoked between suggestion/save, mismatched payload, expired operation and refresh/reopen tests in isolated storage. Owner reviews transaction layout/retention first.

## FR-010: Verify accessible bilingual flagship journey

Dependencies: FR-009. Scope: focused UI fixes for main-page selection, suggestion review, save and Recipes.
Acceptance: keyboard and screen-reader labels/status; focus restoration; loading/cancel/error/conflict preserve state; RTL/LTR mixed units readable; 360px phone/tablet/desktop and 200% zoom usable. Provenance, no-image, unknown-nutrition and disabled-feature states are honest.
Verification: component tests for behavior, isolated Playwright journey including reload/save/outage; manual keyboard and Hebrew/English browser inspection with dated synthetic screenshots.

## FR-011: Add AI evaluation and privacy-safe diagnostics

Status: 30 synthetic bilingual ingredient-admission cases pass offline. Broader safety/quality evaluation, full request budgets and diagnostics redaction remain open; no real-model score is claimed.

Dependencies: FR-007, FR-008, FR-009. Scope: versioned synthetic fixtures, runner/rubric and structured events.
Acceptance: ≥30 bilingual/fault cases; deterministic zero-critical-failure gates from spec; opaque request IDs and bounded metrics; no prompt/name/token/recipe/receipt payload in routine logs or traces. Sentinel redaction tests. Real-model evaluation remains opt-in and separately authorized; report counts/versions/skips, not invented scores.
Verification: offline suite, deadline/retry assertions, authorization-before-provider spy and log sentinel checks. If real trial approved, ≥20 eligible cases ×2 runs, human rubric ≥90% and zero critical failures with recorded latency/cost evidence.

## FR-012: Publish a reviewable local README/demo package

Status: README/setup corrected; isolated build exits normally, and a disposable clean-install snapshot builds/typechecks using exact locked dependencies. Full browser/e2e and live-provider evidence remain absent; no release readiness claim.

Dependencies: FR-010, FR-011. Scope: working-tree README/docs, synthetic assets, verification report; no external publishing.
Acceptance: correct Start server runtime instructions, isolated quickstart/env table, capability matrix, architecture rationale, spec/plan/task links and known limits. Reconcile stale `.specs/` references, pantry contradictions, assistant/emulator guides. Remove unnecessary personal discussion/contact/operational endpoints from current-tree guidance with owner review; avoid deleting useful engineering decisions. Demo script shows normal and failure journey with date/commit/fake-vs-real mode; strip new asset metadata.
Verification: fresh-clone rehearsal; all local links resolve; typecheck, full tests, architecture/fixture checks, isolated build and e2e results recorded. Any failure/skipped live integration prevents a claim of corresponding readiness. Graph change check required before future commit.

## FR-013: Prepare optional external remediation/release proposal

Dependencies: FR-012 for release; may prepare read-only privacy proposal after FR-001.
Acceptance: separate concrete proposals for historical photo/private-discussion remediation, confirmed-exposure credential response, production data/rules migration, deployment/public demo and paid integrations. Explain refs affected, collaborator impact, clones/cache limitations, backup/rollback and verification. Credential rotation only if justified; no secret values in proposal.
Verification: owner can approve each action independently. No history rewrite, credential change, production mutation, external message, paid activation or deployment performed.

## FR-014: Execute only a specifically approved external action

Dependencies: FR-013 plus exact user approval. Status: approval-gated future task.
Acceptance: execute approved scope only; record target/runtime and rollback; verify result before making claims. Each optional integration gets its own scoped receiver-auth/egress/failure checks. Deployment does not upgrade unverified features to “working.”
Verification: action-specific evidence and owner review; halt if approval target or risk changes. This backlog is not permission to perform the action.
