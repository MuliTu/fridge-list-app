import assert from 'node:assert/strict'
import test from 'node:test'
import { planOwnerBindings } from './migrate-shopping-sharing.mjs'

const user = { uid: 'uid-1', email: 'owner@example.com', emailVerified: true }
test('plans exact verified owners, ignores invite-only nodes and is idempotent', () => {
  const households = { 'owner@example_com': { name: 'Home' }, invited: { memberOf: { owner: true } } }
  const plan = planOwnerBindings(households, [user])
  assert.deepEqual(plan.conflicts, [])
  assert.deepEqual(plan.updates, {
    'users/owner@example_com/ownerUid': 'uid-1',
    'users/owner@example_com/normalizedOwnerEmail': 'owner@example.com'
  })
  const second = planOwnerBindings({ 'owner@example_com': { name: 'Home', ownerUid: user.uid, normalizedOwnerEmail: user.email } }, [user])
  assert.deepEqual(second.updates, {})
  assert.equal(second.unchanged, 1)
})
test('refuses sanitized-email collisions, unverified users and conflicting owners', () => {
  const cases = [
    [{ ...user, email: 'own.er@example.com' }, { ...user, uid: 'uid-2', email: 'own_er@example.com' }],
    [{ ...user, email: 'own.er@example.com', emailVerified: false }],
    [{ ...user, email: 'own.er@example.com', disabled: true }]
  ]
  for (const users of cases) {
    const plan = planOwnerBindings({ 'own_er@example_com': { name: 'Home' } }, users)
    assert.equal(plan.conflicts.length, 1)
    assert.deepEqual(plan.updates, {})
  }
  const plan = planOwnerBindings({ 'owner@example_com': { name: 'Home', ownerUid: 'different-uid' } }, [user])
  assert.equal(plan.conflicts.length, 1)
  assert.deepEqual(plan.updates, {})
})
