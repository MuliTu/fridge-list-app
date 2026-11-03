import { applicationDefault, cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabaseWithUrl } from 'firebase-admin/database'
import { pathToFileURL } from 'node:url'

const emailKey = email => email.trim().toLowerCase().replace(/[.#$[\]]/g, '_')

// Match against the complete Auth directory before planning any writes. Never
// bind by a reverse-decoded email key or overwrite a conflicting owner UID.
export function planOwnerBindings(households, users) {
  const byKey = new Map()
  for (const user of users) {
    if (!user.email) continue
    const key = emailKey(user.email)
    byKey.set(key, [...(byKey.get(key) || []), user])
  }
  const updates = {}
  const conflicts = []
  let unchanged = 0
  for (const [listId, household] of Object.entries(households)) {
    if (!household || typeof household !== 'object' || !household.name) continue
    const candidates = byKey.get(listId) || []
    if (candidates.length !== 1 || !candidates[0].emailVerified || candidates[0].disabled) {
      conflicts.push({ listId, reason: 'Owner email is missing, ambiguous, disabled or unverified' })
      continue
    }
    const owner = candidates[0]
    const email = owner.email.trim().toLowerCase()
    if ((household.ownerUid && household.ownerUid !== owner.uid) ||
      (household.normalizedOwnerEmail && household.normalizedOwnerEmail !== email)) {
      conflicts.push({ listId, reason: 'Existing ownership metadata conflicts with Auth' })
      continue
    }
    if (household.ownerUid === owner.uid && household.normalizedOwnerEmail === email) { unchanged++; continue }
    updates[`users/${listId}/ownerUid`] = owner.uid
    updates[`users/${listId}/normalizedOwnerEmail`] = email
  }
  return { updates, conflicts, unchanged }
}

async function main() {
  const databaseURL = process.env.FIREBASE_DATABASE_URL
  if (!databaseURL) throw new Error('FIREBASE_DATABASE_URL is required')
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  const app = initializeApp({
    credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || 'n8n-vocal-2-db'
  })
  const database = getDatabaseWithUrl(databaseURL, app)
  const users = []
  let pageToken
  do {
    const page = await getAuth(app).listUsers(1000, pageToken)
    users.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  const households = (await database.ref('users').get()).val() || {}
  const plan = planOwnerBindings(households, users)
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
    ownersToBind: Object.keys(plan.updates).length / 2, unchanged: plan.unchanged, conflicts: plan.conflicts }, null, 2))
  if (plan.conflicts.length) throw new Error('Resolve ownership conflicts before applying any changes')
  if (!process.argv.includes('--apply') || !Object.keys(plan.updates).length) return
  // Atomically recheck ownership before binding. A concurrent owner change must
  // cause the entire migration to abort instead of being overwritten.
  const result = await database.ref('users').transaction(current => {
    if (!current) return
    for (const path of Object.keys(plan.updates).filter(path => path.endsWith('/ownerUid'))) {
      const listId = path.split('/')[1]
      const before = households[listId]
      const after = current[listId]
      if (!after || (after.ownerUid ?? null) !== (before.ownerUid ?? null) ||
        (after.normalizedOwnerEmail ?? null) !== (before.normalizedOwnerEmail ?? null)) return
    }
    for (const [path, value] of Object.entries(plan.updates)) {
      const [, listId, field] = path.split('/')
      current[listId][field] = value
    }
    return current
  })
  if (!result.committed) throw new Error('Ownership changed during migration; rerun the dry-run')
  console.log('Owner bindings applied. No list contents or household memberships changed.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
