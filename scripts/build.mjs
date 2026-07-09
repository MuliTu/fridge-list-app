// `vite build` never exits on its own in this project's TanStack Start SPA mode
// (`spa: { enabled: true }`, see vite.config.ts) — confirmed by direct process
// inspection (macOS `sample` + `lsof`): the SPA prerender step renders the app to
// produce the static shell, which transitively imports src/lib/firebase.ts, and
// merely evaluating that module (getDatabase()/ref() at module scope, done
// unconditionally by every route/hook that reads Firebase data) opens a real,
// permanent connection to this project's live Realtime Database — confirmed via a
// TLS certificate check on the open socket (*.europe-west1.firebasedatabase.app,
// this exact project's own RTDB region). That's harmless at real runtime (a
// serverless function invocation's response doesn't wait for the Node event loop to
// fully drain), but a one-shot CLI build does need the process to actually exit, and
// Node won't do that while any socket is still open — so `vite build` just sits
// there forever after finishing all its real work, hanging local builds, CI, and
// (confirmed) real Vercel deploys the same way.
//
// This wraps `vite build`, watches for the last line it ever prints on a successful
// SPA build (the prerender summary), and force-exits shortly after — by then every
// real build artifact (dist/client, dist/server) is already written to disk. A real
// build failure still exits (and fails) on its own before ever reaching that line,
// so this only changes behavior for the specific hang-after-success case.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Spawn the vite binary directly, not via `npx vite build` — npx runs vite as its
// own grandchild process, so killing the npx process (our direct child) would only
// orphan the real `vite build` process instead of stopping it, leaving it running
// (and the build still hung) even after this wrapper script itself exits.
const viteBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/vite')
const child = spawn(viteBin, ['build'], { stdio: ['inherit', 'pipe', 'pipe'] })

let settleTimer = null

const finish = (code) => {
  if (settleTimer) clearTimeout(settleTimer)
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL')
    } catch {}
  }
  process.exit(code)
}

const handleChunk = (chunk, stream) => {
  stream.write(chunk)
  if (/\[prerender] Prerendered \d+ pages?:/.test(chunk.toString())) {
    if (settleTimer) clearTimeout(settleTimer)
    // Small grace window for the trailing "- /" page-list line(s) to flush.
    settleTimer = setTimeout(() => finish(0), 1000)
  }
}

child.stdout.on('data', (chunk) => handleChunk(chunk, process.stdout))
child.stderr.on('data', (chunk) => handleChunk(chunk, process.stderr))

child.on('exit', (code, signal) => {
  // Non-SPA builds (or if this hang is ever fixed upstream) exit on their own —
  // trust that exit code/signal rather than forcing anything.
  if (settleTimer) clearTimeout(settleTimer)
  process.exit(code ?? (signal ? 1 : 0))
})

// Absolute safety net in case the marker text ever changes upstream, or a build
// genuinely never finishes for a real reason — never hang CI/Vercel indefinitely.
setTimeout(() => {
  console.error('[build] timed out waiting for vite build to finish — forcing exit')
  finish(1)
}, 180_000).unref()
