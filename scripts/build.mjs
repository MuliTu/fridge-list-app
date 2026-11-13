// Keep the existing npm build entry point while allowing Vite to finish on its own.
// Firebase's browser database is taken offline during server prerender.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const viteBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/vite')
const result = spawnSync(viteBin, ['build'], { stdio: 'inherit' })

if (result.error) {
  console.error('[build] Failed to start Vite:', result.error)
  process.exitCode = 1
} else {
  process.exitCode = result.status ?? 1
}
