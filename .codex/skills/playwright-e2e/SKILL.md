---
name: "playwright-e2e"
description: "Write, run, or debug fridge-list-app's Playwright e2e tests (e2e/*.spec.ts). Use whenever adding a new e2e test, an e2e test is flaky/failing in a way that looks environmental rather than a real regression, or e2e coverage needs extending. Distinct from .codex/skills/senior-qa-jest, which covers Jest unit/integration tests — a genuinely different tool with different failure modes."
---

`@playwright/test`, config at `playwright.config.ts`, specs in `e2e/*.spec.ts`. Run
locally with `npm run test:e2e` (starts its own dev server unless `E2E_BASE_URL` is
set, in which case it tests that URL directly and skips starting a server — used by
`.codex/skills/github-actions-ci`'s post-deploy check to test the real deployment).

## Scope: view-only flows only, deliberately

This app's edit actions (bought toggle, add/delete, admin panels) require a real
Google `signInWithPopup` — not something Playwright automates here. The local dev
auth bypass (`.env.local`'s `VITE_DEV_AUTH_BYPASS`) exists for interactive manual QA,
not for baking into an automated suite that might run against a real deployed URL —
baking a fake-auth flag into CI config that runs against production would be a real
security smell, not a shortcut worth taking. Current coverage: header/tabs render,
tab navigation, sign-in button visible when logged out, language switch. Don't
assume this needs to change without checking whether that reasoning has changed too.

## The hydration race — wait for `networkidle` before interacting

This app is SSR (TanStack Start) + client-hydrated. Confirmed directly: clicking a
button immediately after `page.goto()` can silently no-op — the DOM element exists
and is "actionable" by Playwright's own definition, but React hasn't attached its
event handler yet. `await page.waitForLoadState('networkidle')` right after `goto()`
reliably fixes this; a fixed `waitForTimeout` is not a substitute (worked at 500ms in
one test, still race-y at load-dependent timings) — `networkidle` is the actual
correct signal here, not a magic number.

## Testing against a real deployment — mind Deployment Protection

If pointing `E2E_BASE_URL` at anything other than the known-public stable domain
(`fridge-list-app.vercel.app`), check `.codex/skills/vercel-deployment`'s
Deployment Protection section first. A per-deployment preview/production URL will
302-redirect to Vercel's own login page, and Playwright will faithfully report test
failures against *that* page (recognizable by `geist`-font class names and
`lang="en-US"` in the failure output) — which look like real app bugs at a glance but
aren't. Don't debug the app itself on an e2e failure without first confirming the
test actually reached the app's own HTML.

## Local verification pattern

Before trusting an e2e assertion (especially a new hydration-sensitive interaction),
run a quick standalone Node script with `@playwright/test`'s `chromium.launch()`
directly against the running dev server to confirm the click/assertion actually
behaves as expected, rather than iterating purely through full `npm run test:e2e`
runs — faster feedback loop, and it's how the hydration race above was actually
confirmed (not guessed at).
