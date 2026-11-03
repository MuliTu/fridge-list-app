import assert from 'node:assert/strict'
import { DEMO_LIST_ID, DEMO_PASSWORD, DEMO_USERS, readDemoEnvironment, seedDemo } from './demo-seed.mjs'

const configuration = readDemoEnvironment()
const auth = await seedDemo(configuration)
const tokens = {}
for (const user of DEMO_USERS) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: DEMO_PASSWORD, returnSecureToken: true })
  })
  assert.equal(response.status, 200, `Local sign-in: ${user.role}`)
  const { idToken } = await response.json()
  const decoded = await auth.verifyIdToken(idToken)
  assert.equal(decoded.uid, user.uid)
  tokens[user.role] = idToken
}
await assert.rejects(auth.verifyIdToken('invalid-token'))
const anonymousResponse = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
})
assert.equal(anonymousResponse.status, 200)
tokens.anonymous = (await anonymousResponse.json()).idToken
const read = (role, listId = DEMO_LIST_ID) => fetch(
  `http://127.0.0.1:9000/users/${listId}/groceries.json?ns=demo-fridge-list-default-rtdb&auth=${encodeURIComponent(tokens[role])}`
)
for (const role of ['owner', 'editor', 'viewer']) assert.equal((await read(role)).status, 200, `${role} can read`)
for (const role of ['pending', 'outsider', 'anonymous']) assert.equal((await read(role)).status, 401, `${role} denied by rules`)
assert.equal((await read('owner', 'outsider@example_test')).status, 401, 'Cross-household read denied')
const unauthenticated = await fetch(`http://127.0.0.1:9000/users/${DEMO_LIST_ID}/groceries.json?ns=demo-fridge-list-default-rtdb`)
assert.equal(unauthenticated.status, 401)
const directWrite = await fetch(`http://127.0.0.1:9000/users/${DEMO_LIST_ID}/groceries/blocked.json?ns=demo-fridge-list-default-rtdb&auth=${encodeURIComponent(tokens.owner)}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: 'must-not-write' })
})
assert.equal(directWrite.status, 401, 'Client grocery writes remain closed')
const reopened = await read('editor')
assert.equal((await reopened.json())['demo-tomato'].item, 'tomatoes')
console.log('Local emulator smoke passed: five authenticated identities, approved reads, pending/outsider/cross-household/anonymous denials, closed client writes, and reread.')

if (process.argv.includes('--api')) {
  const request = (path, role, body) => fetch(`http://127.0.0.1:5173${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) },
    body: JSON.stringify(body)
  })
  const input = {
    listId: DEMO_LIST_ID, servings: 2, mealType: 'lunch', language: 'en',
    products: [{ groceryKey: 'demo-tomato', name: 'untrusted client name', category: 'Vegetables' }]
  }
  assert.equal((await request('/api/personal-chef/suggest-recipes', null, input)).status, 401)
  assert.equal((await request('/api/personal-chef/suggest-recipes', 'outsider', input)).status, 403)
  assert.equal((await request('/api/personal-chef/suggest-recipes', 'pending', input)).status, 403)
  assert.equal((await request('/api/personal-chef/suggest-recipes', 'anonymous', input)).status, 401)
  assert.equal((await request('/api/personal-chef/suggest-recipes', 'viewer', input)).status, 200)
  assert.equal((await request('/api/scan-receipt', 'owner', {})).status, 503)
  const suggestion = await request('/api/personal-chef/suggest-recipes', 'owner', input)
  assert.equal(suggestion.status, 200, 'Owner recipe suggestion')
  const result = await suggestion.json()
  assert.equal(result.success, true)
  assert.equal(result.recipes[0].source.model, 'deterministic-local')
  assert.equal(result.recipes[0].selectedProducts[0].name, 'tomatoes')
  const saveInput = { operationId: '00000000-0000-4000-8000-000000000001', listId: DEMO_LIST_ID, recipe: result.recipes[0] }
  for (const role of ['viewer', 'pending', 'outsider']) {
    assert.equal((await request('/api/recipes', role, saveInput)).status, 403, `${role} cannot save`)
  }
  assert.equal((await request('/api/recipes', 'anonymous', saveInput)).status, 401)
  assert.equal((await request('/api/recipes', 'editor', saveInput)).status, 201)
  const saved = await request('/api/recipes', 'owner', saveInput)
  assert.equal(saved.status, 201)
  const savedBody = await saved.json()
  const replays = await Promise.all([1, 2].map(() => request('/api/recipes', 'owner', saveInput)))
  for (const replay of replays) {
    assert.equal(replay.status, 201)
    assert.equal((await replay.json()).key, savedBody.key)
  }
  assert.equal((await request('/api/recipes', 'owner', {
    ...saveInput, recipe: { ...result.recipes[0], title: 'Conflicting recipe' }
  })).status, 409)

  const concurrentInput = { ...saveInput, operationId: '00000000-0000-4000-8000-000000000002' }
  const concurrentSaves = await Promise.all([1, 2].map(() => request('/api/recipes', 'owner', concurrentInput)))
  for (const response of concurrentSaves) assert.equal(response.status, 201)
  const concurrentBodies = await Promise.all(concurrentSaves.map((response) => response.json()))
  assert.equal(concurrentBodies[0].key, concurrentBodies[1].key, 'Concurrent first saves have one key')
  assert.notEqual(concurrentBodies[0].key, savedBody.key, 'Intentional new operations have different keys')
  const allRecipes = await fetch(`http://127.0.0.1:9000/users/${DEMO_LIST_ID}/recipes.json?ns=demo-fridge-list-default-rtdb&auth=${encodeURIComponent(tokens.owner)}`)
  assert.equal(Object.keys(await allRecipes.json()).length, 3, 'Two owner operations and one editor operation, without duplicate records')
  assert.equal((await request('/api/recipes', 'owner', { listId: DEMO_LIST_ID, recipe: result.recipes[0] })).status, 400)
  console.log('Recipe replay passed: concurrent first saves, subsequent retries, payload conflict, principal scope, distinct operations and required UUID.')

  const reopenedRecipe = await fetch(`http://127.0.0.1:9000/users/${DEMO_LIST_ID}/recipes/${savedBody.key}.json?ns=demo-fridge-list-default-rtdb&auth=${encodeURIComponent(tokens.editor)}`)
  assert.equal(reopenedRecipe.status, 200)
  assert.equal((await reopenedRecipe.json()).title, result.recipes[0].title)
  const groceryPath = `/api/lists/${DEMO_LIST_ID}/groceries`
  const command = (path, method, role, body) => fetch(`http://127.0.0.1:5173${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const groceryInput = { name: 'demo beans', category: 'Vegetables', operationId: 'smoke-operation-0001' }
  for (const role of ['viewer', 'pending', 'outsider']) {
    assert.equal((await command(groceryPath, 'POST', role, groceryInput)).status, 403)
  }
  const creates = await Promise.all([1, 2].map(() => command(groceryPath, 'POST', 'editor', groceryInput)))
  for (const response of creates) assert.equal(response.status, 200)
  const created = await Promise.all(creates.map((response) => response.json()))
  assert.equal(created[0].key, created[1].key, 'Concurrent replay creates one item')
  assert.equal((await command(groceryPath, 'POST', 'editor', { ...groceryInput, name: 'different' })).status, 409)
  const itemPath = `${groceryPath}/${created[0].key}`
  assert.equal((await command(itemPath, 'PATCH', 'owner', { name: 'beans renamed' })).status, 204)
  assert.equal((await command(`${itemPath}/purchased`, 'PUT', 'editor', { bought: true })).status, 204)
  assert.equal((await command(`${itemPath}/purchased`, 'PUT', 'viewer', { bought: false })).status, 403)
  const afterUpdate = await (await read('viewer')).json()
  assert.equal(afterUpdate[created[0].key].item, 'beans renamed')
  assert.equal(afterUpdate[created[0].key].bought, true)
  assert.equal((await command(itemPath, 'DELETE', 'owner')).status, 204)
  assert.equal((await command(itemPath, 'PATCH', 'owner', { name: 'must not resurrect' })).status, 404)
  assert.equal((await (await read('viewer')).json())[created[0].key], undefined)
  console.log('Local grocery commands passed: role denials, concurrent add replay, conflicting replay, rename, purchased state, read projection, deletion and missing-item protection.')
  const revoked = await fetch(`http://127.0.0.1:9000/users/${DEMO_LIST_ID}/members/demo-editor.json?ns=demo-fridge-list-default-rtdb`, {
    method: 'DELETE', headers: { Authorization: 'Bearer owner' }
  })
  assert.equal(revoked.status, 200)
  assert.equal((await request('/api/recipes', 'editor', saveInput)).status, 403, 'Revocation applies to the next request')
  assert.equal((await request('/api/personal-chef/suggest-recipes', 'editor', input)).status, 403)
  console.log('Local API role checks passed: pending/viewer write/anonymous denials, editor save, revoked editor denied.')
  console.log('Local API smoke passed: missing token and outsider denied, integration disabled, authoritative products, deterministic generation, explicit save and member reread.')
}
