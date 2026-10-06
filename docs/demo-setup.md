# Isolated demo setup

Status: FR-003b runtime wiring and local FR-003c smoke verified; full G1 remains open.
Progress: [Execution evidence](plans/flagship-progress.md)
Spec: [Flagship readiness](specs/spec-flagship-readiness.md)

## Prerequisites

Node.js 22.12+, Firebase CLI and Java 21. On this machine Firebase CLI 15.32.1 and
OpenJDK 21.0.12.1 are installed. New interactive terminal sessions load Java via
`.zshrc`. First emulator startup downloads Firebase's local emulator binaries.
No Firebase login, real cloud project or service account is required.

## Run locally

From the project root, prepare the ignored synthetic env file (preserve an existing
file if present), then verify it:

```bash
cp -n .env.demo.example .env.demo
npm run demo:check
```

In one terminal:

```bash
npm run demo:emulators
```

Wait for “All emulators ready”. In a second terminal, reset only the local synthetic
fixtures and start the guarded app:

```bash
npm run demo:seed
npm run demo:dev
```

Open `http://127.0.0.1:5173/` and press Sign in / התחברות. Demo login uses actual
Auth-emulator email/password tokens for `owner@example.test`; it does not bypass
Firebase authentication. Google popup login remains the normal app path. To test
another synthetic identity, sign out first and open `/?demoUser=editor` (or `viewer`,
`pending`, `outsider`) before signing in. These are the only permitted demo roles.
Demo data/password are deliberately public synthetic fixtures.

In a third terminal:

```bash
npm run demo:smoke -- --api
npm run test:demo-config
```

Smoke resets the local demo fixtures before checking them, so do not use it to
preserve manual demo edits. `demo:seed` likewise resets this synthetic project only.
Use Ctrl+C in each server terminal for teardown; there is no import/export of real
household data. Restart after changing `.env.demo` or its configuration contract.

## Isolation contract

[Shared config](../demo.config.json) is the source of truth for preflight and runtime.
[Template](../.env.demo.example) contains fake SDK IDs and loopback-only hosts:

| Variables | Audience | Meaning |
| --- | --- | --- |
| `FRIDGE_DEMO_MODE`, `VITE_FRIDGE_DEMO_MODE` | Server/browser | Explicit synthetic mode |
| `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_PROJECT_ID` | Server/browser | Same `demo-fridge-list` project |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_AUTH_DOMAIN` | Browser | Fake SDK identifiers |
| `FIREBASE_DATABASE_URL`, `VITE_FIREBASE_DATABASE_URL` | Server/browser | Loopback RTDB, namespace `demo-fridge-list-default-rtdb` |
| `FIREBASE_AUTH_EMULATOR_HOST` | Admin | Loopback Auth 9099 |
| `FIREBASE_DATABASE_EMULATOR_HOST` | Admin | Loopback RTDB 9000 |
| `FIRESTORE_EMULATOR_HOST` | Admin | Loopback Firestore 8080 |
| `PERSONAL_CHEF_PROVIDER` | Server | Curated salad fixtures and unknown nutrition; no model API key |
| `FRIDGE_OPTIONAL_INTEGRATIONS` | Server/browser | Optional provider APIs disabled in the demo server |
| `VITE_DEV_AUTH_BYPASS` | Server/browser | False; actual emulator tokens required |

The browser SDK explicitly connects Auth, RTDB and Firestore to loopback. The Admin
app is named separately and requires process/environment agreement before use.
Preflight rejects missing/unknown file settings, credential/tracing/integration
settings and inherited conflicts without echoing values. Vite runs on loopback with
`envDir: false`; its demo path removes Start's independent `.env.local` loader and
fails closed if that plugin identity changes. The normal configuration path is
preserved. Do not launch this demo through ordinary `npm run dev` or copy the demo
settings over household `.env.local`.

The demo middleware returns 503 for all API integrations except recipe suggestions
and explicit recipe saves, plus authenticated grocery add/update/purchased/delete commands. CSP restricts browser connections/images/frames to self
and local emulators; remote recipe images therefore stay unavailable. This is a
bounded development mode, not a production network firewall. Browser egress was not
independently audited at packet level. `npm run demo:build` now writes isolated artifacts to ignored `dist-demo/` and
runs prerender under a Node loopback-only connection guard. It uses a filtered
process environment and never loads household env files. The browser SDK stays
offline during server rendering, so a successful build exits normally rather than
being force-killed. These are verification artifacts, not a deployment procedure.

[Emulator config](../firebase.demo.json) loads the existing RTDB rules into the CLI's
expected `demo-fridge-list-default-rtdb` namespace. Seed checks exact loaded-rule
equality before any reset/write, so an unconfigured permissive namespace cannot pass.
[Firestore demo rules](../firestore.demo.rules) deny all client access; receipt/image
features are outside the current recipe slice. No production rules are altered.

## Verified and remaining

Verified on 2026-10-05: five seeded identities and Admin token verification; owner,
approved editor/viewer RTDB reads; pending/outsider/cross-household/unauthenticated
read denial; client grocery write denial; member reread. API smoke verifies 401 for
missing token, 403 for outsider, 503 for disabled integration, authoritative product
names, deterministic suggestion, explicit save and approved-member recipe reread.
Browser owner sign-in and persisted login after reload were observed in Hebrew.

Role checks now cover recipe and grocery writes: viewers/pending/outsiders are denied;
anonymous tokens are rejected; revocation is honored on the next request. Grocery
smoke covers concurrent add replay, payload conflicts, rename, purchased state,
read projection, deletion and missing-item protection. A failed browser add retains
its operation ID while that API client instance exists. A replay after deletion or
browser reload has no durable guarantee yet; it is not the completed FR-009 design.

Known remaining work:
Repeated onboarding and hydration errors were observed and need UI investigation;
Full bilingual/responsive/accessibility journey and provider evaluation remain
unverified. Clean-install working-tree snapshot build/typecheck validation is
recorded below; it is not a fresh Git clone containing uncommitted changes. G1 is not marked passed. These commands
support a reproducible local test slice, not a complete flagship demo or production
validation.

Official SDK references: [Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth),
[RTDB emulator](https://firebase.google.com/docs/emulator-suite/connect_rtdb),
[Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).


## Current save and chef contracts

Recipe POST requests require a UUID operationId. Browser drafts persist before the
request and can be explicitly retried after reload; scope is UID + household +
recipe identity. Identical server replays return the original record, while changed
payloads conflict. Sign-out clears pending recipe drafts. No recipe deletion is
included in this milestone. Local storage/API tests verify this contract; full
browser recovery remains unverified because browser access was denied by policy.

The offline chef only supports tomatoes, lettuce and cucumber (and their curated
Hebrew names). Unsupported selections fail clearly; it is not a general cooking
fallback. Outside demo, an unavailable provider returns an error rather than a
fabricated local meal. Nutrition enrichment defaults off; explicit opt-in uses
PERSONAL_CHEF_NUTRITION_ENABLED=true outside demo, with known positive weights and
approximate model/source labels. No live model accuracy is claimed.


## Isolated build and clean-install verification

Run `npm run demo:build` after creating `.env.demo` from the tracked template.
Output is `dist-demo/client` and `dist-demo/server`; household `dist/` is not used.
`npm run test:demo-build` verifies the Node network guard. The guard blocks
non-loopback Node TCP connections, including the metadata IP, and permits local
prerender/IPC. It is not an OS firewall or proof about arbitrary native binaries.
Do not deploy these demo artifacts or expose their server as a public demo; deployed
runtime authentication, optional routes and hosting remain separate review gates.

On 2026-10-05, a disposable source/config/assets snapshot was installed using
`npm ci --ignore-scripts --no-audit --no-fund` with empty npm configuration and its
own cache. The lockfile SHA-256 matched the checkout. 926 exact locked packages
installed; no dependency lifecycle scripts ran. All package URLs in the lockfile
were registry.npmjs.org. A cache-only attempt first failed on an uncached tarball;
registry access was therefore required for this rehearsal. The snapshot included
runtime prompt Markdown, but excluded household env files, Git metadata and private
project documentation. Its isolated build and TypeScript check passed with its own
node_modules, without reusing or replacing the working checkout's dependencies.
Verified environment: macOS arm64, Node 24.21.0, npm 11.19.0. Other supported Node
versions and platforms are not established by this one rehearsal.

Optional production webhook variables and disabled-by-default behavior are documented
in the [external remediation proposal](plans/external-remediation-proposal.md).
