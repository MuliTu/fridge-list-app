import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { isLocalConnection } = require('./demo-build-network.cjs')
const guard = fileURLToPath(new URL('./demo-build-network.cjs', import.meta.url))

test('allows only loopback TCP hosts and local IPC connection shapes', () => {
  for (const args of [[9000, '127.0.0.1'], [{ port: 9000, host: 'localhost' }], [{ port: 9000, host: '::1' }], [[{ port: 9000, host: '127.0.0.1' }]], [{ path: '/tmp/local-worker.sock' }]]) {
    assert.equal(isLocalConnection(args), true)
  }
  for (const args of [[443, 'example.com'], [{ host: '169.254.169.254', port: 80 }], [{ host: '10.0.0.1', port: 443 }], [[{ host: 'example.com', port: 443 }]]]) {
    assert.equal(isLocalConnection(args), false)
  }
})

test('preload rejects an actual remote socket request before connection', () => {
  const output = execFileSync(process.execPath, ['--require', guard, '-e', `
    try { require('node:net').connect(443, 'example.com'); process.exit(2) }
    catch (error) { process.stdout.write(error.message) }
  `], { encoding: 'utf8' })
  assert.match(output, /blocked a non-loopback/)
})
