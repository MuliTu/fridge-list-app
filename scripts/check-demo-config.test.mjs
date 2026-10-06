import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { checkDemoConfigFile, DEMO_CONFIG, validateDemoConfig } from './check-demo-config.mjs'

test('accepts the tracked synthetic template without loading an SDK', () => {
  assert.deepEqual(checkDemoConfigFile(new URL('../.env.demo.example', import.meta.url)), [])
})

test('rejects every missing required setting', () => {
  for (const key of Object.keys(DEMO_CONFIG)) {
    const configuration = { ...DEMO_CONFIG }
    delete configuration[key]
    assert.ok(validateDemoConfig(configuration).some((error) => error.startsWith(key)))
  }
})

test('rejects production project, remote emulator, namespace mismatch, AI and auth bypass', () => {
  for (const [key, value] of [
    ['FIREBASE_PROJECT_ID', 'real-household'],
    ['VITE_FIREBASE_PROJECT_ID', 'another-demo'],
    ['FIREBASE_DATABASE_URL', 'https://real-household.firebasedatabase.app'],
    ['VITE_FIREBASE_DATABASE_URL', 'http://127.0.0.1:9000?ns=real-household'],
    ['FIREBASE_AUTH_EMULATOR_HOST', 'remote.example:9099'],
    ['FIRESTORE_EMULATOR_HOST', 'localhost:8080'],
    ['PERSONAL_CHEF_PROVIDER', 'openai'],
    ['VITE_DEV_AUTH_BYPASS', 'true']
  ]) {
    assert.ok(validateDemoConfig({ ...DEMO_CONFIG, [key]: value }).length)
  }
})

test('rejects credentials and unknown keys without echoing values', () => {
  const sentinel = 'private-sentinel-value'
  for (const key of ['GOOGLE_API_KEY', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'LANGSMITH_API_KEY', 'RECEIPT_SCAN_URL', 'TYPO']) {
    const errors = validateDemoConfig({ ...DEMO_CONFIG, [key]: sentinel })
    assert.ok(errors.length)
    assert.ok(!errors.join('\n').includes(sentinel))
  }
})

test('rejects inherited provider credentials, tracing and conflicting config', () => {
  for (const key of ['OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'LANGSMITH_TRACING', 'FIREBASE_PROJECT_ID']) {
    const errors = validateDemoConfig(DEMO_CONFIG, { [key]: 'private-sentinel-value' })
    assert.ok(errors.length)
    assert.ok(!errors.join('\n').includes('private-sentinel-value'))
  }
  assert.deepEqual(validateDemoConfig(DEMO_CONFIG, DEMO_CONFIG), [])
})

test('missing file fails closed', () => {
  assert.ok(checkDemoConfigFile('/does-not-exist/fridge-demo-env').length)
})

test('CLI exits nonzero on invalid config and reports no credential value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'fridge-demo-config-'))
  try {
    const path = join(directory, '.env.demo')
    writeFileSync(path, 'FIREBASE_SERVICE_ACCOUNT_JSON=private-sentinel-value\n')
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-demo-config.mjs', import.meta.url)), '--env', path], {
      encoding: 'utf8', env: {}
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Demo configuration rejected/)
    assert.ok(!(result.stdout + result.stderr).includes('private-sentinel-value'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('CLI accepts template and explains the verification limit', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-demo-config.mjs', import.meta.url)), '--env', fileURLToPath(new URL('../.env.demo.example', import.meta.url))], {
    encoding: 'utf8', env: {}
  })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /wiring is not yet verified/)
})
