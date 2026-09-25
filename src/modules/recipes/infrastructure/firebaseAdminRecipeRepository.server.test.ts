jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseAdminListAuthorizationRepository } from './firebaseAdminRecipeRepository.server'

const principal = (email: string | null) => ({
  kind: 'user' as const,
  uid: 'uid-1',
  email,
  emailVerified: true
})

const database = (values: Record<string, unknown>) => ({
  ref: jest.fn((path: string) => ({
    get: jest.fn(async () => ({
      exists: () => Object.prototype.hasOwnProperty.call(values, path),
      val: () => values[path] ?? null
    }))
  }))
})

describe('FirebaseAdminListAuthorizationRepository', () => {
  it('allows the owner when the list id matches the signed-in email key', async () => {
    const db = database({
      'users/muli@example_com': { name: 'Muli list' }
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal('muli@example.com'), 'muli@example_com')
    ).resolves.toBeUndefined()
  })

  it('allows a shared member with pending or approved membership', async () => {
    const db = database({
      'users/owner@example_com': { name: 'Owner list' },
      'users/member@example_com/memberOf/owner@example_com': 'pending'
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal('member@example.com'), 'owner@example_com')
    ).resolves.toBeUndefined()
  })

  it('allows an owner-side invite entry', async () => {
    const db = database({
      'users/owner@example_com': {
        name: 'Owner list',
        invites: {
          'member@example_com': { email: 'member@example.com', status: 'approved' }
        }
      }
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal('member@example.com'), 'owner@example_com')
    ).resolves.toBeUndefined()
  })

  it('allows legacy uid-based owner and member records', async () => {
    const db = database({
      'users/owner@example_com': {
        name: 'Owner list',
        ownerUid: 'other-uid',
        members: { 'uid-1': { status: 'approved' } }
      }
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal(null), 'owner@example_com')
    ).resolves.toBeUndefined()
  })

  it('rejects users without owner or member access', async () => {
    const db = database({
      'users/owner@example_com': { name: 'Owner list' }
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal('stranger@example.com'), 'owner@example_com')
    ).rejects.toMatchObject({
      code: 'forbidden'
    })
  })
})
