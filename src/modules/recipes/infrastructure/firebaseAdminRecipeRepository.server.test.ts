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
      val: () => {
        if (Object.prototype.hasOwnProperty.call(values, path)) return values[path]
        const [root, listId, ...segments] = path.split('/')
        return segments.reduce<any>((value, segment) => value?.[segment], values[`${root}/${listId}`]) ?? null
      }
    }))
  }))
})

describe('FirebaseAdminListAuthorizationRepository', () => {
  it.each(['viewer', undefined, 'owner', 'unknown'])('denies member writes with role %p', async (role) => {
    const repository = new FirebaseAdminListAuthorizationRepository(database({
      'users/household': { ownerUid: 'other', members: { 'uid-1': { status: 'approved', role } } }
    }) as any)
    await expect(repository.assertAccessible(principal(null), 'household', 'read')).resolves.toBeUndefined()
    await expect(repository.assertAccessible(principal(null), 'household', 'write')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it.each([
    { ownerUid: 'uid-1' },
    { ownerUid: 'other', members: { 'uid-1': { status: 'approved', role: 'editor' } } }
  ])('allows writes for UID owners and approved editors', async (list) => {
    const repository = new FirebaseAdminListAuthorizationRepository(database({ 'users/household': list }) as any)
    await expect(repository.assertAccessible(principal(null), 'household', 'write')).resolves.toBeUndefined()
  })

  it('allows UID ownership independently of email', async () => {
    const repository = new FirebaseAdminListAuthorizationRepository(database({
      'users/household': { ownerUid: 'uid-1' }
    }) as any)
    await expect(repository.assertAccessible(principal(null), 'household')).resolves.toBeUndefined()
  })

  it.each(['pending', 'approved', { status: 'pending' }, { status: 'revoked' }, null])(
    'rejects unapproved or malformed UID membership: %p', async (membership) => {
      const repository = new FirebaseAdminListAuthorizationRepository(database({
        'users/household': { ownerUid: 'other', members: { 'uid-1': membership } }
      }) as any)
      await expect(repository.assertAccessible(principal(null), 'household'))
        .rejects.toMatchObject({ code: 'forbidden' })
    }
  )

  it('rejects email-derived ownership without a matching owner UID', async () => {
    const db = database({
      'users/muli@example_com': { name: 'Muli list' }
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal('muli@example.com'), 'muli@example_com')
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('rejects legacy reverse membership even when pending', async () => {
    const db = database({
      'users/owner@example_com': { name: 'Owner list' },
      'users/member@example_com/memberOf/owner@example_com': 'pending'
    })
    const repository = new FirebaseAdminListAuthorizationRepository(db as any)

    await expect(
      repository.assertAccessible(principal('member@example.com'), 'owner@example_com')
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('rejects owner-side email invites without approved UID membership', async () => {
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
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('allows approved UID membership', async () => {
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
