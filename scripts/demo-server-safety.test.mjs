import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoRequestPolicy, demoSafetyPlugin, isolateStartPlugins } from './demo-server-safety.mjs'

test('removes only Start env loading in demo and fails closed if its identity changes', () => {
  const routePlugin = { name: 'router' }
  const plugins = [routePlugin, [{ name: 'tanstack-start-core:load-env' }]]
  assert.deepEqual(isolateStartPlugins(plugins), [routePlugin])
  assert.equal(plugins[1].length, 1)
  assert.throws(() => isolateStartPlugins([{ name: 'renamed-loader' }]), /must be reviewed/)
})

test('allows pages, Vite assets and isolated recipe/grocery APIs', () => {
  for (const path of ['/', '/recipes', '/src/main.tsx', '/@vite/client', '/api/recipes', '/api/lists/owner@example_test/groceries', '/api/lists/owner@example_test/groceries/item/purchased', '/api/personal-chef/suggest-recipes?x=1']) {
    assert.equal(demoRequestPolicy(path), true, path)
  }
})

test('blocks optional providers and encoded API paths', () => {
  for (const path of ['/api/scan-receipt', '/api/lists/owner@example_test/receipts', '/api/lists/owner@example_test/groceries/item/upload', '/api/send-invite-email', '/api/ai/analyze', '/api/n8n-write-groceries', '/%61pi/scan-receipt', '/api%2fscan-receipt', '/api//scan-receipt', '/%2561pi/scan-receipt', '/api/%', '/API/scan-receipt', '/foo/%252e%252e/api/scan-receipt']) {
    assert.equal(demoRequestPolicy(path), false, path)
  }
})

test('disabled integrations return a clear failure without reaching route handlers', () => {
  let middleware
  demoSafetyPlugin().configureServer({ middlewares: { use: (handler) => { middleware = handler } } })
  const headers = {}
  let body
  let continued = false
  const response = { setHeader: (key, value) => { headers[key] = value }, end: (value) => { body = value } }
  middleware({ url: '/api/scan-receipt' }, response, () => { continued = true })
  assert.equal(response.statusCode, 503)
  assert.equal(continued, false)
  assert.match(headers['Content-Security-Policy'], /127\.0\.0\.1:9099/)
  assert.match(JSON.parse(body).error, /disabled/)
})
