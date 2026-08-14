// Assembles Vercel's Build Output API v3 structure (.vercel/output/) by hand, after
// `vite build` has already produced dist/client (static assets) and
// dist/server/server.js (a Web-standard `{ fetch }` SSR handler).
//
// Why this exists: this TanStack Start version doesn't use Nitro anymore, so there's
// no built-in "vercel" deploy preset/target to lean on, and Vercel's own zero-config
// Vite framework preset only knows how to serve a flat static dist/ folder — it has
// no idea dist/server/server.js needs to run as a serverless function. Without this,
// every route (including "/") 404s, since dist/ here is nested under dist/client/
// rather than flat. Confirmed via a real deployment before this fix existed.
//
// Presence of .vercel/output after the build command runs is what makes Vercel use
// it directly instead of framework-specific defaults — see vercel.json's
// buildCommand.
import { cp, mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { nodeFileTrace } from '@vercel/nft'

const OUT = '.vercel/output'
// Keep the function path distinct from static/index.html. Naming both outputs
// "index" makes Vercel resolve the SPA fallback to the Lambda on `/`, defeating
// filesystem-first routing and turning an API-only startup failure into a full-site
// outage.
const FUNC = `${OUT}/functions/api.func`

await rm(OUT, { recursive: true, force: true })
await mkdir(`${OUT}/static`, { recursive: true })
await mkdir(FUNC, { recursive: true })

if (!existsSync('dist/client') || !existsSync('dist/server/server.js')) {
  throw new Error('vercel-build.mjs: dist/client or dist/server/server.js missing — run `vite build` first')
}

await cp('dist/client', `${OUT}/static`, { recursive: true })
// SPA mode (vite.config.ts's `spa: { enabled: true }`) prerenders one static shell
// for the whole app instead of per-route SSR — copy it to the conventional
// `index.html` name so Vercel's filesystem-first routing serves it directly for "/"
// without needing the Lambda at all. Every other page route (client-side routed,
// e.g. /stock, /receipts) also needs this exact file as its SPA fallback — handled
// below in config.json's routes, not by copying it under every possible path.
if (existsSync(`${OUT}/static/_shell.html`)) {
  await cp(`${OUT}/static/_shell.html`, `${OUT}/static/index.html`)
}
// The whole dist/server tree, not just server.js — server.js dynamically
// import()s a handful of its own chunk files by relative path
// (./assets/router-*.js etc, TanStack Router's route-level code splitting applies
// to the SSR build too), so copying only server.js leaves those unresolvable at
// runtime. Keep the original .js filenames (rather than renaming to .mjs) since
// server.js's import() calls reference these exact relative paths/filenames.
await cp('dist/server', FUNC, { recursive: true })

// `firebase-admin` (added for ticket F2's retry-feedback route) is the one dependency
// vite.config.ts deliberately keeps OUT of the noExternal bundle (see that file's
// comment) — bundling its transitive dependency tree (grpc/gcp-metadata/google-gax,
// written assuming real Node `require` semantics) into dist/server's single Rollup
// chunk broke at runtime with `TypeError: Cannot read properties of undefined
// (reading 'SDK_VERSION')`, confirmed by hitting this directly. Because it stays a
// real bare `require`/`import` in dist/server/server.js, this function's own
// node_modules needs an actual `firebase-admin` (plus whatever it transitively
// needs) sitting next to it — unlike every other dependency here, which is fully
// inlined and needs nothing on disk at runtime.
//
// `@vercel/nft` (the same dependency-tracing tool Vercel's own Next.js/Node builders
// use internally) statically traces every file dist/server/server.js could `require`/
// `import` at runtime and reports back just the files actually reachable — this
// copies only that traced subset of node_modules instead of the entire (much larger)
// root node_modules folder, keeping the function bundle small.
const { fileList } = await nodeFileTrace(['dist/server/server.js'])
const nodeModuleFiles = [...fileList].filter((f) => f.startsWith('node_modules/'))
for (const file of nodeModuleFiles) {
  const dest = path.join(FUNC, file)
  await mkdir(path.dirname(dest), { recursive: true })
  await cp(file, dest)
}
console.log(`vercel-build.mjs: copied ${nodeModuleFiles.length} traced node_modules files (firebase-admin + deps) into ${FUNC}`)

await writeFile(
  `${FUNC}/index.mjs`,
  `import handler from './server.js'

// Build Output API v3 Node functions use the traditional Node (req, res) signature,
// not a Web-standard fetch handler — this adapts the two, rather than relying on
// less-certain "does this Vercel runtime version accept a Response object" behavior.
export default async function (req, res) {
  const url = \`https://\${req.headers.host}\${req.url}\`
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v))
    else headers.set(key, value)
  }

  const init = { method: req.method, headers }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req
    init.duplex = 'half'
  }

  const response = await handler.fetch(new Request(url, init))

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))

  if (response.body) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
  }
  res.end()
}
`
)

await writeFile(
  `${FUNC}/.vc-config.json`,
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs' }, null, 2)
)

await writeFile(
  `${FUNC}/package.json`,
  JSON.stringify({ type: 'module' }, null, 2)
)

// filesystem-first: serve a static file if the request path matches one (assets,
// index.html itself). Then /api/* always needs the Lambda — those are real server
// routes (scan-receipt, categorize-item, etc.) with no static equivalent. Everything
// else is a client-side-routed SPA page (/, /stock, /receipts, and any path
// TanStack Router itself resolves or 404s) — those all get the same static shell
// rather than the Lambda, which is the actual point of enabling SPA mode (no SSR
// cold start just to serve the same shell every route already gets). Before this,
// every request — including plain page loads — fell through to the Lambda
// regardless, making SPA mode behaviorally identical to the old per-request SSR
// setup it was meant to replace.
// Security response headers, applied to every path (static assets, the SPA shell, and
// the /api Lambda alike). This is a `continue: true` route placed *before* the
// filesystem handler so it only sets headers and lets routing carry on to the rules
// below — it never short-circuits a request. Deliberately scoped to
// clickjacking/MIME-sniffing/referrer defenses only: no Content-Security-Policy with a
// script-src (Firebase's SDK + inline styles would break), just the safe headers.
//   - X-Frame-Options: DENY + CSP frame-ancestors 'none' — the page can't be framed
//     (clickjacking). frame-ancestors 'none' is the modern equivalent X-Frame-Options
//     doesn't break Firebase since it constrains framing, not script/style/connect.
//   - X-Content-Type-Options: nosniff — browsers must honor declared Content-Types.
//   - Referrer-Policy: strict-origin-when-cross-origin — reasonable default that still
//     sends full referrer same-origin but only the origin cross-origin.
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}

await writeFile(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '/(.*)', headers: SECURITY_HEADERS, continue: true },
        { handle: 'filesystem' },
        { src: '/api/(.*)', dest: '/api' },
        { src: '/(.*)', dest: '/index.html' }
      ]
    },
    null,
    2
  )
)

console.log('vercel-build.mjs: wrote .vercel/output (static + api.func)')
