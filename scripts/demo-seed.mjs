import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseEnv } from 'node:util'
import { checkDemoConfigFile, validateDemoConfig } from './check-demo-config.mjs'

export const DEMO_PASSWORD = 'local-demo-only-password'
export const DEMO_LIST_ID = 'owner@example_test'
export const DEMO_USERS = ['owner', 'editor', 'viewer', 'pending', 'outsider'].map((role) => ({
  uid: `demo-${role}`, email: `${role}@example.test`, displayName: `Demo ${role}`, role
}))

export const readDemoEnvironment = () => {
  const errors = checkDemoConfigFile('.env.demo', process.env)
  if (errors.length) throw new Error('Demo config rejected. Run npm run demo:check.')
  return parseEnv(readFileSync('.env.demo', 'utf8'))
}

/** Resets only the fixed local synthetic project; never accepts a target argument. */
export const seedDemo = async (configuration) => {
  if (validateDemoConfig(configuration, process.env).length) throw new Error('Demo config rejected before seed.')
  Object.assign(process.env, configuration)
  const rulesResponse = await fetch('http://127.0.0.1:9000/.settings/rules.json?ns=demo-fridge-list-default-rtdb', {
    headers: { Authorization: 'Bearer owner' }
  })
  const expectedRules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'))
  if (!rulesResponse.ok || !isDeepStrictEqual(await rulesResponse.json(), expectedRules)) {
    throw new Error('Local demo namespace rules do not match database.rules.json; seed refused.')
  }
  const { getApps, initializeApp } = await import('firebase-admin/app')
  const { getAuth } = await import('firebase-admin/auth')
  const app = getApps().find((candidate) => candidate.name === 'fridge-demo-fixtures') ||
    initializeApp({ projectId: 'demo-fridge-list' }, 'fridge-demo-fixtures')
  const auth = getAuth(app)
  const cleared = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-fridge-list/accounts', { method: 'DELETE' })
  if (!cleared.ok) throw new Error('Local Auth emulator reset failed.')
  for (const user of DEMO_USERS) {
    await auth.createUser({ uid: user.uid, email: user.email, displayName: user.displayName, emailVerified: true, password: DEMO_PASSWORD })
  }
  const users = Object.fromEntries(DEMO_USERS.map((user) => [user.email.replaceAll('.', '_'), {
    ownerUid: user.uid, name: `Demo ${user.role} list`, members: {},
    ...(user.role === 'editor' || user.role === 'viewer' ? { memberOf: { [DEMO_LIST_ID]: 'approved' } } : {})
  }]))
  users[DEMO_LIST_ID] = {
    ...users[DEMO_LIST_ID],
    members: {
      'demo-editor': { status: 'approved', role: 'editor' },
      'demo-viewer': { status: 'approved', role: 'viewer' },
      'demo-pending': { status: 'pending', role: 'editor' }
    },
    groceries: {
      'demo-tomato': { item: 'tomatoes', category: 'Vegetables', bought: true, quantity: 4, unit: 'pcs' },
      'demo-lettuce': { item: 'lettuce', category: 'Vegetables', bought: true, quantity: 1, unit: 'pcs' },
      'demo-unbought': { item: 'cucumbers', category: 'Vegetables', bought: false }
    },
    categories: { vegetables: { name: 'Vegetables', sortOrder: 0 } }
  }
  const written = await fetch('http://127.0.0.1:9000/.json?ns=demo-fridge-list-default-rtdb', {
    method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ users })
  })
  if (!written.ok) throw new Error('Local database fixture reset failed.')
  return auth
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await seedDemo(readDemoEnvironment())
    console.log('Reset local demo-fridge-list fixtures: five synthetic users and isolated households. No live project accessed.')
  } catch {
    console.error('Demo seed failed. Check demo config and local emulator availability. No remote target is supported.')
    process.exitCode = 1
  }
}
