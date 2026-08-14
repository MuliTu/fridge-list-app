import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { reconcileSpaAssetReferences } from './reconcile-spa-assets.mjs'

const fixture = async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fridge-spa-assets-'))
  const assets = path.join(root, 'assets')
  const html = path.join(root, 'index.html')
  await mkdir(assets)
  t.after(() => rm(root, { recursive: true, force: true }))
  return { assets, html }
}

test('replaces a stale App stylesheet hash with the sole emitted stylesheet', async (t) => {
  const paths = await fixture(t)
  await writeFile(path.join(paths.assets, 'App-current.css'), 'body {}')
  await writeFile(path.join(paths.assets, 'index-current.js'), 'export {}')
  await writeFile(
    paths.html,
    '<link rel="stylesheet" href="/assets/App-stale.css"><script src="/assets/index-current.js"></script>'
  )

  const replacements = await reconcileSpaAssetReferences(paths.html, paths.assets)

  assert.deepEqual(replacements, [{ from: 'App-stale.css', to: 'App-current.css' }])
  assert.match(await readFile(paths.html, 'utf8'), /App-current\.css/)
})

test('rejects a shell that references any other missing asset', async (t) => {
  const paths = await fixture(t)
  await writeFile(path.join(paths.assets, 'App-current.css'), 'body {}')
  await writeFile(paths.html, '<script src="/assets/index-missing.js"></script>')

  await assert.rejects(
    reconcileSpaAssetReferences(paths.html, paths.assets),
    /SPA shell references missing build assets: index-missing\.js/
  )
})
