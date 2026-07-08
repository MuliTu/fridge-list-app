---
name: "vercel-deployment"
description: "Deploy, debug, or configure fridge-list-app's Vercel hosting — the hand-rolled Build Output API setup, dev-vs-build config splits, and Deployment Protection. Use whenever the deployed site 404s/500s, a build/runtime error only shows up on Vercel (not locally), Vercel project/deployment config needs changing, or a workflow needs to hit the real deployed URL."
---

fridge-list-app deploys to Vercel (project `prj_hqFA8MfT7yoPRWMhYdvs60xTIGiJ`, team
`team_sA058WjDDRrAsi0OM7BwClJA`, production domain `fridge-list-app.vercel.app`) via
Vercel's native GitHub integration — confirmed by checking `get_project`'s `domains`
list for a `fridge-list-app-git-main-*.vercel.app` entry, which only exists for
git-linked projects, not CLI-only deploys. Every push to any branch gets its own
Vercel deployment and fires a GitHub `deployment_status` event.

## Why this needs a dedicated setup, not zero-config

This TanStack Start version doesn't use Nitro anymore — `vite build` produces
`dist/client` (static assets) + `dist/server/server.js` (a Web-standard `{ fetch }`
SSR handler you run yourself), not a framework-specific deploy artifact. Vercel's
"vite" Framework Preset only knows how to serve a **flat** static `dist/` folder
(like `dist/index.html`) — it has no idea `dist/server/server.js` needs to run as a
serverless function, and since the real output is nested under `dist/client/`, the
zero-config static handler can't even find that. Confirmed directly: a real
deployment 404'd on every single route, including `/`, before this was fixed.

## The fix: hand-rolled Build Output API v3

- `vercel.json`'s `buildCommand` runs `npm run build && node scripts/vercel-build.mjs`
  and sets `"framework": null`.
- `scripts/vercel-build.mjs` assembles `.vercel/output/` after the Vite build:
  - `dist/client/*` → `.vercel/output/static/`
  - **The whole `dist/server` tree**, not just `server.js` — `server.js` dynamically
    `import()`s a handful of its own chunk files by relative path (TanStack Router's
    route-level code splitting applies to the SSR build too). Copying only
    `server.js` leaves those unresolvable at runtime. Keep the original `.js`
    filenames; the relative `import()` calls reference those exact paths.
  - A `.vc-config.json` (`{ "runtime": "nodejs22.x", "handler": "index.mjs",
    "launcherType": "Nodejs" }`) plus a `package.json` (`{ "type": "module" }`) inside
    the function directory — Node.js Functions here use the traditional `(req, res)`
    signature, not a Web-standard handler directly, so `index.mjs` adapts between the
    two rather than assuming the runtime accepts a `Response` object natively.
  - `config.json`'s `routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }]`
    — serve a static file if the path matches one, otherwise fall through to the SSR
    function for everything.
- **Verify a change to this locally before pushing**: `npm run build && node
  scripts/vercel-build.mjs`, then directly `import()` the assembled
  `.vercel/output/functions/index.func/server.js` in a throwaway Node script and call
  `.fetch(new Request(...))` on it — this caught a real `ERR_MODULE_NOT_FOUND` (a
  missing `ssr.noExternal` bundling step) before it ever reached a real deployment.

## `vite.config.ts`'s `ssr.noExternal` — build-only, not dev

The function ships `server.js` alone, no `node_modules` alongside it, so any
externalized npm dependency (react, `@tanstack/*`, `h3-v2`, `seroval`, ...) fails at
runtime with `ERR_MODULE_NOT_FOUND`. `ssr: { noExternal: true }` fixes that by
bundling everything in — but applying it unconditionally breaks the **dev server**
outright (`ReferenceError: module is not defined`, from Vite's dev-mode SSR module
runner choking on CJS packages like `react` when told not to externalize them). Gate
it on the Vite `command`:

```ts
export default defineConfig(({ command }) => ({
  ssr: command === 'build' ? { noExternal: true } : undefined,
  // ...
}))
```

This exact regression has been hit and re-fixed more than once in this project —
check this is still conditioned on `command === 'build'` before assuming a dev-server
"module is not defined" crash is unrelated.

## Vercel Deployment Protection — blocks naive automated checks

Confirmed directly: the **per-deployment** URL (`environment_url`/`target_url` in a
`deployment_status` payload, or any `fridge-list-xxxxx-muliteam.vercel.app` URL) sits
behind Vercel's Deployment Protection auth wall for **both** preview and production
targets — a plain `curl` against it 302-redirects to Vercel's own login page. The
**stable custom domain** (`fridge-list-app.vercel.app`) is genuinely public,
confirmed the same way. Any automated check (e2e tests, health checks, this app's
own `web_fetch_vercel_url`-style tooling) that hits the per-deployment URL instead of
the stable domain will silently fail against Vercel's login page, not this app —
recognizable by `geist`-font-branded HTML in the response instead of this app's
actual Hebrew markup. See `.claude/skills/github-actions-ci` for how the post-deploy
e2e check works around this (production-only, hardcoded stable domain).

## Debugging a live deployment

- `get_project` → `latestDeployment` for the current deployment id/state.
- `get_deployment_build_logs` for build-time failures (framework detection, missing
  deps, etc).
- `get_runtime_logs`/`get_runtime_errors` for request-time failures (a blank
  `FUNCTION_INVOCATION_FAILED` response means check these, not the build logs).
- `web_fetch_vercel_url` for a Vercel-authenticated fetch (bypasses Deployment
  Protection) — useful for confirming what a real visitor sees, but don't mistake a
  successful fetch through this tool for proof the URL is *publicly* reachable; cross
  check with a plain `curl` for that.
