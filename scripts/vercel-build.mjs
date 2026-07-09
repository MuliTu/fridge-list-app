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

const OUT = '.vercel/output'
const FUNC = `${OUT}/functions/index.func`

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
await writeFile(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: 'filesystem' },
        { src: '/api/(.*)', dest: '/index' },
        { src: '/(.*)', dest: '/index.html' }
      ]
    },
    null,
    2
  )
)

console.log('vercel-build.mjs: wrote .vercel/output (static + index.func)')
