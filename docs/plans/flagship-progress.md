# Flagship execution evidence

Date: 2026-10-05, approximately 08:50 Asia/Jerusalem.
Branch: `codex/flagship-readiness`, created at local `1606b3a1ea01362837dea99ebe763b1b31571754`.
Plan: [Implementation plan](plan-flagship-readiness.md)
Backlog: [Tasks](../specs/tasks-flagship-readiness.md)

## First reviewable slice

| Task | State | Evidence / remaining acceptance |
| --- | --- | --- |
| FR-001 | Local baseline captured; fresh remote/upstream decision pending | Cached `origin/main`: `0e9256702ea9602c39a52163353e3741664155fd`. Fresh `git ls-remote` failed GitHub DNS; no upstream changes applied. |
| FR-002 | Local execution authorized; proposed milestone defaults recorded | User requested a new branch and to start tasks. Focused list → chef → explicit save scope, UID rules and isolated fake demo used for preparatory work. Owner review/learning checkpoint remains open; no migration or external action authorized. |
| FR-003a | Complete locally | [Synthetic env template](../../.env.demo.example), [preflight](../../scripts/check-demo-config.mjs), [negative tests](../../scripts/check-demo-config.test.mjs) and [setup status](../demo-setup.md). |
| FR-003b/c | Local runtime and smoke verified; G1 remains open | Browser/Admin emulator wiring, seed/rules guard, Auth/RTDB/API smoke and browser owner login/reload verified. Clean-clone, full UI and build pending. |
| FR-004–FR-012 | Pending | No authorization, feature, UI or deployed-runtime changes in this slice. |
| FR-013/014 | Separate approval gates | No history, credentials, production data/rules, deployment or paid-service changes. |

## Baseline and graph evidence

Cached upstream adds `fbd0b9e` and merge `0e92567`: deterministic recipe grouping,
Hebrew copy and one test, limited to chef graph and its test (90 additions/24 removals).
Read-only review confirms this is independent of setup/auth defects. Keep this delta
visible; reconcile in a later explicit baseline decision rather than importing it
silently. Existing untracked `.claude/Projects.code-workspace` is preserved.

GitNexus index-only refresh succeeded using the installed cached CLI: 4,833 nodes,
11,448 edges, 183 clusters, 373 flows at local HEAD. It required sandbox escalation
for the external registry lock. The analyzer reported traversal limits (280 candidate
entry points dropped, 803 callees skipped, four budget-cut walks); absent flows are
not evidence of no impact. Package impact: LOW, four documentation dependents, no
resolved execution processes. Spec/plan/task impacts: LOW documentation references.
Docs index/ignore/new-file targets were UNKNOWN; confirmed local references/patterns
and absence of existing new paths by text inspection before additive edits.

## Verification performed

- `npm run test:demo-config`: 8 passed; rejects live project/remote host/wrong namespace,
  missing/unknown fields, provider mode, auth bypass, inherited credentials/tracing;
  sentinel values absent from errors; CLI exit code tested.
- `npm run demo:check -- --env .env.demo.example`: passed; no app/services started.
- `npm run test:architecture`: 9 fixture tests passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed; all 32 relative Markdown links in the readiness/setup/progress docs resolve.
- `npm run architecture:check`: reproduces the same four baseline violations.
- GitNexus `detect-changes --scope all --repo .`: LOW for three tracked changed files, no affected processes. This does not cover the new untracked scripts/docs; stage the reviewed files and rerun analysis before any future commit. No clean whole-slice graph claim is made.
- `.env.demo` and `.env.local` remain ignored. Only `.env.demo.example` is exempted.

Full app tests, build, browser, emulator and real-provider evaluation were not run.
The four pre-existing architecture violations remain assigned to FR-005; passing the
checker fixture tests is not the same as passing `architecture:check` on the app.
No claims of runtime isolation or flagship readiness follow from preflight success.

## Next review

Review the exact synthetic configuration and rejected failure cases. Next slice is
FR-003b: trace browser/Admin/legacy verifier boundaries, report their graph impact,
and wire explicit demo isolation with fail-closed startup before any app execution.
FR-003c must wait for that wiring and an emulator rehearsal. No commit or push made.

## Prerequisite installation follow-up — 2026-10-05

User explicitly requested installing both tools. `npm install -g firebase-tools@latest`
and `brew install openjdk@21` succeeded. Firebase CLI 15.32.1, Java 21.0.12.1 and
`javac` 21.0.12.1 verified in a fresh `zsh -lic` session. Java setup appended to
`.zshrc`; existing contents preserved. No Firebase login, project selection, emulator
startup or production action performed. Installation resolves the missing-tool blocker
only; FR-003b/c and G1 remain pending.

## Emulator/runtime slice — 2026-10-05, approximately 09:20 Asia/Jerusalem

- Browser Auth/RTDB/Firestore now connect explicitly to local emulators in guarded
  demo mode; the normal SDK setup remains the normal path.
- Named demo Admin app requires exact process/config agreement and uses emulator
  identity without a privileged credential. Server composition accepts local RTDB
  only through the explicit validated demo mode; recipe generation remains fake.
- Launcher reads only `.env.demo`; demo Vite disables normal env loading and removes
  Start's separate env-loader plugin. Runtime validation caught Start loading
  household `.env.local` during verification; this was fixed before successful smoke.
- Added local emulator config, deny-all demo Firestore rules, deterministic fixtures,
  loaded-RTDB-rule equality check, seed/reset and API/rule smoke commands.
- The first rule test exposed a namespace mismatch: `demo-fridge-list` was a separate
  permissive emulator namespace. All demo connections now use the CLI-loaded
  `demo-fridge-list-default-rtdb`, and seed refuses unexpected rules. Both issues were
  discovered by real integration checks, not treated as passed preflight evidence.
- Demo optional API routes are disabled; CSP bounds browser endpoints and images.
  This is a dev-server boundary, not production deployment or a packet-level audit.

Verification: 744 Jest tests / 116 suites passed; 12 demo preflight/server-safety
checks passed; typecheck passed; nine architecture fixture tests passed. Application
architecture checker still reports the same four baseline violations. Real local
Auth/RTDB smoke passed for five synthetic identities with negative rules cases.
API smoke passed missing-token/outsider/disabled-integration, authoritative grocery
lookup, deterministic recipe, explicit save and approved-member reread.

Browser Hebrew owner sign-in, inventory display and authenticated reload were
observed. Demo sign-in uses real emulator email/password tokens rather than Google
popup or a dev-auth bypass. Hydration errors and repeated onboarding were observed;
full UI flow is not clean. Pending-member/viewer server policy remains a known
FR-004 issue; rule smoke does not establish Admin-policy parity. No full demo/build,
clean-clone or real-model success claim. No household env, cloud rules/data, Git refs
beyond the requested branch, history, deployment or credentials changed.

Final review for this slice: `git diff --check` passed; all 36 relative Markdown links
resolve. Refreshed GitNexus includes new scripts/runtime (4,915 nodes, 11,629 edges,
375 flows). Tracked-diff analysis reports CRITICAL risk, 20 symbols in seven tracked
files and 23 affected processes, consistent with shared startup/auth composition.
The CLI displays shortened symbol/flow samples; untracked files remain outside Git
diff analysis. This is not a complete pre-commit graph clearance. Before any commit,
stage the reviewed additions and rerun the full graph check, resolving incomplete
results. Full Jest regression and real local smoke provide the recorded verification.

### FR-004a — server read authorization parity (2026-10-05)

The Admin recipe authorization repository now requires matching `ownerUid` or
`members[uid].status === approved`. Email-derived ownership, email invites, reverse
`memberOf` records, pending/revoked memberships and bare status strings no longer
grant access. No client rules or stored records were changed. Legacy households
without UID bindings fail closed; their migration remains an explicit decision.

GitNexus class impact was LOW; helper impact was CRITICAL (20 upstream symbols,
13 flows including shared command dispatch). This risk was reported before editing.
Focused repository/recipe command tests passed: 2 suites, 13 tests. FR-004 remains
open: viewer write restrictions, anonymous-token rejection and expanded real API
smoke cases still require implementation and verification. Previous full-suite and
emulator results above predate this change and do not validate those remaining cases.

### FR-004b / FR-005 — role enforcement and architecture repairs (2026-10-05)

Recipe saves explicitly request write authorization. UID owners and approved
editors may save; approved viewers may read/suggest but cannot save. Invalid roles
never grant writes. Authorization reads only ownerUid and the requesting UID's
membership, rechecking every request; missing households return forbidden rather
than disclosing existence. Firebase Admin token verification rejects anonymous
providers before a principal reaches the recipe service. Legacy email/invite-only
records still fail closed; no data migration or client-rule change was performed.

Application services no longer read process.env or import node:crypto. Composition
injects an explicit development identity only for NODE_ENV=development and the
explicit bypass flag; production, test and unspecified environments require tokens.
Recipe run IDs are a required injected dependency already provided by composition.
Graph analysis reported CRITICAL composition/helper impact and it was surfaced
before changes. UNKNOWN method/file results were supplemented with text call-site
inspection, not treated as evidence of no callers.

Verification: full Jest run 117 suites / 759 tests passed; four additional focused
composition tests cover production/test/unspecified bypass rejection and explicit
development injection. Architecture checker passed with zero violations (221
source files); all nine checker fixture tests passed. Local Auth/RTDB/API smoke
passed with real synthetic tokens: pending/outsider denied, anonymous denied,
viewer suggestion allowed/save denied, owner/editor saves allowed, editor revocation
immediately denies subsequent suggestion/save, authoritative groceries, saved-record
reread and disabled optional API. These replace the earlier pending/viewer caveat.
The smoke resets only the disposable demo namespace and intentionally revokes the
synthetic editor at the end; rerun demo:seed to restore initial demo fixtures.

Remaining: chef application still imports graph infrastructure (follow-up port
extraction, not hidden by a passing checker), grocery server commands are unwired,
UI hydration/onboarding gaps and the broader flagship backlog remain. No real
model, production integration, build or clean-clone readiness claim follows from
these tests. No commit/push/deployment/real household mutation performed.

### FR-006 and bounded chef follow-ups (2026-10-05)

Grocery add/edit/purchased/delete now use the shared Admin app and UID write
permission. The demo browser selects the API path automatically; realtime Firebase
reads are preserved. A dedicated SDK adapter avoids production credentials in the
emulator path. Updates use transactions and do not resurrect missing items.
Concurrent adds carrying the same principal-bound operation return one key; altered
payload returns conflict. The browser reuses an operation after uncertain failure
within its current client instance. This is not durable replay protection after
reload or deletion; those limitations remain explicit. API-mode mutations no
longer perform a forbidden client audit write after a successful server write.
Image attachment/deletion cases fail clearly rather than silently using legacy
writes. Optional receipt/assistant integrations remain disabled in demo.

Local smoke verified viewer/pending/outsider write denials, concurrent identical
adds, conflicting payload, owner rename, editor purchased-state update, viewer
read projection, owner deletion and 404 when updating a deleted item. Different
synthetic identities exercised write/read behavior against actual local services.
This is API evidence, not a claimed two-browser UI journey.

Chef graph execution now has a 30-second maximum, forwards abort signals to model
adapters, caps graph steps at 10 (default 8), and disables provider retries. HTTP
cancellation is forwarded. Timeout/pre-cancellation and one generation/one nutrition
call are tested; a full-request budget including authentication/inventory and any
fallback graph is still open. Pantry context is empty. Ingredient matching no
longer accepts substring matches such as eggs-with-butter. Synthetic image-query
URLs are no longer manufactured. Count-based nutrition heuristics were removed;
unavailable local/enrichment values remain null. Real model nutrition provenance
and ambiguous-unit behavior still need work.

Added 30 versioned bilingual/adversarial ingredient-grounding cases in
`src/modules/recipes/evals/ingredient-grounding.json`: exact matches, whitespace,
plural cases, unselected basics, compound ingredients, substring collisions,
instruction text, HTML and Unicode confusables. All 30 pass offline. They measure
ingredient admission only, not general food safety, model quality or medical safety.
The conservative matcher also rejects unsupported translations rather than guessing.

Verification: full Jest run 118 suites / 768 tests passed before the final fixture
addition; the subsequent focused run passed 7 suites / 71 tests, including all 30
new cases. TypeScript passes; architecture checker has zero violations (222 source
files); all 12 demo isolation/policy tests pass. Real local smoke passed after the
grocery/chef changes. README now points to isolated setup, gives a status matrix,
and removes the incorrect static `serve dist` deployment instruction.

Review checkpoints are concrete: [recipe save storage/retention](recipe-save-idempotency-decision.md)
and [chef fallback scope](chef-fallback-decision.md). Questions were sent to the
owner; no response has yet been treated as consent. Recipe storage/schema changes
and the chosen fallback redesign await those decisions.

Browser verification was blocked when the browser tool rejected reloading the
existing tab under its URL/protocol policy. No alternate browser or indirect
workaround was attempted. The UI gate remains open; no new screenshot or full
browser verification is claimed. Existing hydration/onboarding findings remain
unresolved. Safe local API/test work continued independently of that block.

No commit, push, deployment, public-history operation, credential change or real
cloud-data mutation was performed. All implementation is reviewable in the working
tree on codex/flagship-readiness; preserve the original untracked workspace file.

Final working-tree checks for these slices: `git diff --check` and all 47 relative
documentation links pass. GitNexus refreshed to 4,975 nodes / 11,923 edges / 375
reported flows; it explicitly warns that some entry points/callees were omitted.
Tracked-diff analysis reports CRITICAL (27 files, 104 symbols, 104 flows) and prints
shortened samples. Untracked additions are still excluded from that diff view.
This is review context, not a complete pre-commit clearance; no commit was made.

Five additional SDK-adapter tests pass: empty/traversal/dotted item IDs cannot construct a database reference, and provider failure maps to a stable application error. TypeScript passed after the final path validation change.

### Approved decisions implemented; execution connection lost (2026-10-05)

The owner explicitly approved both proposed decisions in the main conversation.
Recipe saves now require a UUID and use a UID-scoped deterministic key with atomic
same-record fingerprint metadata. Concurrent/replayed saves return one key;
conflicting payload returns 409; revoked access remains forbidden. Browser pending
saves persist before transmission, restore only within the same UID/list scope,
require an explicit retry, and clear on sign-out. Recipe deletion remains absent.
Client storage tests cover uncertain-response recovery, client recreation, scope
isolation, payload conflicts and unavailable storage. The local API smoke verified
exact record counts, concurrent first saves, distinct operations and required UUIDs.

Real-provider failure now returns a recoverable error; no generic cooking fallback
is substituted. The offline generator supports only curated tomato/lettuce/cucumber
salad fixtures, with English/Hebrew instructions and explicit demo labels. Raw meat,
cleaning products and unknown ingredients are rejected by the demo generator.
An HTTP-level deadline includes authentication/parsing/inventory/model execution;
provider cancellation propagates, although an already-started Firebase read cannot
be forcibly cancelled. New recipes bind ingredients to authoritative grocery keys;
ambiguous equal names and forged keys are rejected. Known non-food categories are
also rejected using the existing server-side food-category filter.

Nutrition enrichment is now opt-in via PERSONAL_CHEF_NUTRITION_ENABLED=true, remains
disabled in the isolated demo, and is skipped without explicit positive weights.
Unsupported legacy values are hidden; model estimates carry source/basis metadata
and a bilingual approximate-estimate label. Unknown/failed estimates remain null.
External image-query fallbacks and personal-data recipe-save logging were removed.

Verification before the connection loss: full Jest 122 suites / 819 tests passed;
the subsequent missing-UUID fix passed its focused test and real emulator/API smoke.
After nutrition source/basis changes, TypeScript and 77 focused recipe tests passed.
The latest attempt to add/run further nutrition tests failed before an exec process
could start: the execution transport disconnected and recovery timed out. No result
from that attempted command is claimed. Final full regression, additional nutrition
tests, graph refresh and final diff/link checks remain pending. Browser UI validation
is separately blocked by the previously reported URL policy; no bypass was attempted.

### Connection restored; final local checks completed (2026-10-05)

Verified the saved working tree before resuming: the previous progress entry and
approved implementations survived; the interrupted extra nutrition test files had
not been created. Added the missing tests and completed the checks:

- Full Jest: 124 suites / 824 tests passed, including nutrition unit/UI states.
- TypeScript passed; architecture checker passed (224 source files, zero violations).
- All 9 architecture fixture tests and all 12 demo isolation/policy tests passed.
- Final real localhost Auth/RTDB/API smoke passed: recipe concurrent first saves,
  subsequent retries, conflict, principal scope, distinct operations, missing-UUID
  rejection, all grocery mutations, role denials, revocation and reread.
- git diff --check passed; all 47 relative documentation links resolve.

The disconnected session had left the confirmed demo Java emulators orphaned while
Auth had stopped. Identified their PIDs and project/rules arguments, terminated only
those demo processes, and restarted the local suite and demo server. All emulators
are ready; successful final smoke followed that restart.

GitNexus refreshed to 5,056 nodes / 12,148 edges / 376 reported flows. It still
reports omitted entry points/callees. Tracked-diff review reports CRITICAL impact:
40 files, 147 symbols, 113 flows, with shortened display samples. Untracked additions
are not included in that diff summary. This is not complete pre-commit clearance;
no commit was requested or made.

Connection loss is resolved. The separate browser URL-policy denial remains in
force; no browser retry, alternate surface or workaround was attempted. Full UI
recovery/sign-out, hydration/onboarding, accessibility/responsiveness, clean-clone
rehearsal and isolated production-build validation remain open release gates.
Live model quality/nutrition accuracy and production integrations remain unverified.
All changes stay local on codex/flagship-readiness, without push, deployment,
public-history changes, credentials changes or real cloud-data writes.

### Isolated build and clean-install gates (2026-10-05)

Inspected the existing build wrapper before execution. Its legacy normal-build
path infers success from a prerender log marker and kills the process; isolated
verification deliberately uses a separate supervised Vite process and requires
normal exit code 0. Added npm run demo:build, outputting only ignored dist-demo/,
with validated synthetic env, filtered inherited variables and a Node-level
loopback/IPC connection guard. Two guard tests pass, including an actual remote
socket attempt rejected before connection. The guard is not an OS firewall.

The first build exposed two real local issues: Start's internal preview omitted
the demo mode, and a browser Firebase RTDB connection kept prerender alive. Vite
now recognizes only the validated demo prerender preview context; the browser SDK
is explicitly offline during server rendering. Server command repositories still
use their separate Admin SDK. Graph impact for the shared Firebase file was HIGH
and surfaced before editing. Dedicated Node/browser tests verify SSR disconnect
and browser connectivity behavior. After the fix, the isolated build generated
client/server bundles, prerendered one page and exited normally with code 0; no
success marker or forced termination was used to call that run successful.

Created a disposable working-tree snapshot with its own node_modules, excluding
household env, Git/tool metadata and private docs, but including runtime Markdown
prompts. A cache-only npm ci attempt failed because a tarball was not cached.
Then installed 926 exact locked packages from registry.npmjs.org using an isolated
cache, empty npm configs, and --ignore-scripts --no-audit --no-fund. No dependency
lifecycle scripts ran. Lockfile SHA-256 matched the untouched checkout:
fb8ec4d2f856610daa0ac1f6740fc7bef657e00a258946e2ad6ad237e97e64ce.

The clean-install snapshot passed isolated build, TypeScript and its full Jest
suite (124 suites / 824 tests). The working checkout passed 125 suites / 825 tests,
including the additional SSR regression test added after copying the snapshot.
Architecture check passed with zero violations (224 source files). Node 24.21.0 /
npm 11.19.0 on macOS arm64 were used; minimum supported Node/other OS builds were
not tested. The build emits existing large-chunk warnings; they are not hidden.

Verification logs are local temporary files: /tmp/fridge-demo-build.log,
/tmp/fridge-clean-install.log, /tmp/fridge-clean-build.log,
/tmp/fridge-clean-typecheck.log, /tmp/fridge-final-tests.log and
/tmp/fridge-clean-tests.log. The disposable snapshot remains at
$TMPDIR/fridge-clean-install-irjt92tr.
This is a clean-install snapshot rehearsal, not a claim that uncommitted work
exists in a fresh Git clone. Working dependencies, household env files and secrets
were not removed or changed; no new system tools were installed.

The previously open isolated-build/clean-install checks are now verified. Remaining
release gates are browser UI/e2e/accessibility and the known hydration/onboarding
issues, live-model evaluation (not authorized), production runtime/hosting review,
and complete pre-commit graph review if a commit is later requested. The browser
URL denial was not retried or bypassed. No publication, deployment or live-data
operation occurred.


### Current-tree documentation and endpoint cleanup (2026-10-05)

Replaced CLAUDE.md's personal/operational handbook with current contributor guidance,
and CONVERSATION.md's private transcript with a durable-decision index. Rewrote README
around the isolated flagship slice, verification limits and spec → plan → tasks.
Sanitized both .claude and .codex n8n/Firebase/backend guides: removed deployed workflow
identifiers, obsolete open-rules instructions and implied permission for live actions.
Historical chef documents now link correctly and explicitly defer pantry assumptions
to the selected-products-only flagship contract. Machine-specific paths were removed
from current public-facing status prose. The existing GitNexus managed block is intact.

Before cleanup, 62 Markdown originals were preserved under ignored
.local-private/readiness-docs-20261005/ with restrictive permissions and a SHA-256
manifest. All 62 hashes were rechecked successfully. This directory must never be
force-added. No real env file or unrelated workspace edit was changed.

Removed hardcoded deployed webhook defaults from categorization, feedback, receipt,
purchase-habit and feedback-retry paths. Providers receive explicit server configuration;
a shared validator rejects missing/malformed/non-HTTPS/embedded-credential/fragment
URLs with a safe unavailable error before fetch. Feedback retry checks configuration
before reading or mutating database records. This is fail-closed configuration, not
proof of receiver authentication or complete optional-integration privacy hardening.
Legacy feedback payload minimization remains an activation prerequisite.

Pre-edit GitNexus reported HIGH for shared server composition (17 direct importing
routes); this warning was surfaced. Provider classes and receipt/retry flows were LOW;
unresolved method/document names were confirmed with text references. Existing index
coverage limits still apply; no commit clearance is claimed.

Validation: six focused suites / 54 tests passed, then all 126 suites / 844 tests
passed. TypeScript passed; architecture checker passed for 225 source files. Tests
cover absent/invalid configuration without fetch, existing configured contracts and
retry configuration rejection before database access. All 80 relative Markdown links
in the public overview, contributor/index pages and docs/ resolved. Scanning tracked
and untracked Markdown found no Gmail/Hotmail/Outlook personal emails, deployed
ngrok/Firebase/Vercel endpoint URLs, known workflow IDs or personal home paths.
No former deployed ngrok host remains under src/. These targeted scans are not a
comprehensive secret audit. Test logs remain temporary local artifacts.

FR-013 now has a concrete independently approvable proposal for historical media/private
docs, evidence-based credential response, migrations, optional receivers, deployment
and paid/live AI. The 14-task status matrix distinguishes the browser policy blocker,
remaining local diagnostics review and optional external work. Remote main was last
observed unchanged at 0e9256702ea9602c39a52163353e3741664155fd. No public content or
history has changed: all edits remain uncommitted locally, with no push, deployment,
credential rotation, paid call or live data operation. Browser access was not retried.

The post-cleanup isolated build also completed normally (exit 0), emitting client/server
artifacts and prerendering one page with the remote-network guard in place. Existing
large-chunk warnings remain. The RTDB cutover guide now points to the actual demo
rehearsal instead of a nonexistent emulator test file. Four duplicated repository
skill guides match between .claude and .codex. Git diff whitespace checks pass.
