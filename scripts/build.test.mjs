import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const buildScript = fileURLToPath(new URL('./build.mjs', import.meta.url))

test('build waits for Vite and propagates failure after a prerender summary', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'fridge-build-'))
  try {
    const scriptsDir = path.join(fixture, 'scripts')
    const binDir = path.join(fixture, 'node_modules', '.bin')
    mkdirSync(scriptsDir, { recursive: true })
    mkdirSync(binDir, { recursive: true })
    copyFileSync(buildScript, path.join(scriptsDir, 'build.mjs'))

    const fakeVite = path.join(binDir, 'vite')
    writeFileSync(fakeVite, `#!/usr/bin/env node
console.log('[prerender] Prerendered 1 pages:')
setTimeout(() => {
  console.log('Vite finished after the prerender summary')
  process.exit(7)
}, 1500)
`)
    chmodSync(fakeVite, 0o755)

    const result = spawnSync(process.execPath, [path.join(scriptsDir, 'build.mjs')], {
      encoding: 'utf8',
      timeout: 5000
    })

    assert.equal(result.error, undefined)
    assert.equal(result.status, 7)
    assert.match(result.stdout, /Vite finished after the prerender summary/)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
