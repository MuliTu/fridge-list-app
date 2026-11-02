import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { reconcileShellStylesheets } from './reconcile-shell-stylesheets.mjs'

test('replaces a missing hashed stylesheet with the emitted asset', async () => {
  const staticDir = await mkdtemp(path.join(os.tmpdir(), 'fridge-css-'))
  try {
    await mkdir(path.join(staticDir, 'assets'))
    await writeFile(path.join(staticDir, 'assets', 'App-current.css'), 'body {}')
    await writeFile(
      path.join(staticDir, '_shell.html'),
      '<link rel="stylesheet" href="/assets/App-stale.css">'
    )

    await reconcileShellStylesheets(staticDir)

    assert.match(await readFile(path.join(staticDir, '_shell.html'), 'utf8'), /App-current\.css/)
  } finally {
    await rm(staticDir, { recursive: true, force: true })
  }
})

test('rejects an ambiguous replacement instead of shipping a broken shell', async () => {
  const staticDir = await mkdtemp(path.join(os.tmpdir(), 'fridge-css-'))
  try {
    await mkdir(path.join(staticDir, 'assets'))
    await writeFile(path.join(staticDir, 'assets', 'App-one.css'), 'body {}')
    await writeFile(path.join(staticDir, 'assets', 'App-two.css'), 'body {}')
    await writeFile(
      path.join(staticDir, '_shell.html'),
      '<link rel="stylesheet" href="/assets/App-stale.css">'
    )

    await assert.rejects(() => reconcileShellStylesheets(staticDir), /found 2/)
  } finally {
    await rm(staticDir, { recursive: true, force: true })
  }
})
