/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseShoppingSharingService } from './firebaseShoppingSharing.server'
import type { ShoppingShareSnapshot } from '..'

const owner = { kind: 'user' as const, uid: 'owner-uid', email: 'owner@example.com', emailVerified: true }
const guest = { kind: 'user' as const, uid: 'guest-uid', email: 'guest@example.com', emailVerified: true }
const stranger = { kind: 'user' as const, uid: 'stranger-uid', email: 'stranger@example.com', emailVerified: true }
const householdId = 'owner@example_com'

// A stateful repository double exercises authorization across successive calls,
// including revocation and items moved after a guest opened a list.
function fixture() {
  const state: any = { users: { [householdId]: { ownerUid: owner.uid, categories: {
    dairy: { name: 'Dairy', color: '#f0c96b', icon: '🥛', order: 2 },
    custom: { name: 'Custom shelf', color: '#123456', icon: '✨', order: 1 },
    private: { name: 'Health', color: '#ff0000', icon: '🔒', order: 0 }
  }, groceries: {
    a: { item: 'Milk', category: 'Dairy', bought: false, list_name: 'A', added_at: '2026-11-03' },
    custom: { item: 'Special', category: 'Custom shelf', bought: false, list_name: 'A', added_at: '2026-11-03' },
    b: { item: 'Private medicine', category: 'Health', bought: false, list_name: 'B', added_at: '2026-11-03', image_ref: 'private-image' },
    permanent: { item: 'Bread', category: 'Bakery', bought: false, list_name: null }
  } } } }
  const read = (path: string) => path.split('/').filter(Boolean).reduce((node, key) => node?.[key], state) ?? null
  const write = (path: string, value: unknown) => {
    const segments = path.split('/').filter(Boolean)
    let node = state
    for (const segment of segments.slice(0, -1)) node = node[segment] ??= {}
    if (value === null) delete node[segments.at(-1)!]
    else node[segments.at(-1)!] = structuredClone(value)
  }
  let pushed = 0
  const reference = (path = ''): any => ({
    get: async () => ({ val: () => structuredClone(read(path)), exists: () => read(path) !== null }),
    child: (key: string) => reference(`${path}/${key}`),
    update: async (updates: Record<string, unknown>) => { for (const [key, value] of Object.entries(updates)) write(path ? `${path}/${key}` : key, value) },
    push: async (value: unknown) => { write(`${path}/added-${++pushed}`, value) },
    transaction: async (update: (value: any) => any) => {
      const value = update(structuredClone(read(path)))
      if (value === undefined) return { committed: false }
      write(path, value)
      return { committed: true }
    }
  })
  const db = { ref: jest.fn(reference) }
  const auth: any = { getUserByEmail: jest.fn(async (email: string) => ({ displayName: email.split('@')[0], photoURL: 'https://example.com/avatar.png' })) }
  const service = new FirebaseShoppingSharingService(db as any, auth)
  const request = (action: string, fields = {}) => ({ action, householdId, listName: 'A', ...fields })
  const invite = async () => {
    await service.execute(owner, request('invite', { email: guest.email }))
    return (await service.discover(guest))[0].id
  }
  return { state, read, write, service, request, invite, db, auth }
}

describe('per-shopping-list sharing isolation', () => {
  it('provisions only a verified new user own list and preserves existing content', async () => {
    const f = fixture()
    await f.service.execute(guest, { action: 'provision' })
    expect(f.read('users/guest@example_com')).toMatchObject({ ownerUid: guest.uid, normalizedOwnerEmail: guest.email })
    const original = f.read(`users/${householdId}/groceries`)
    await f.service.execute(owner, { action: 'provision' })
    expect(f.read(`users/${householdId}/groceries`)).toEqual(original)
  })

  it('does not let signup claim unbound legacy data or a conflicting UID', async () => {
    const f = fixture()
    f.write('users/guest@example_com', { name: 'Legacy private list', groceries: { a: { item: 'Private' } } })
    await expect(f.service.execute(guest, { action: 'provision' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(f.service.execute({ ...owner, uid: 'another-uid' }, { action: 'provision' })).rejects.toMatchObject({ code: 'forbidden' })
    expect(f.read('users/guest@example_com/groceries/a/item')).toBe('Private')
  })

  it('shares A without creating any household-wide membership or exposing B/permanent', async () => {
    const f = fixture()
    const id = await f.invite()
    const result = await f.service.execute(guest, { action: 'snapshot', shareId: id }) as ShoppingShareSnapshot
    expect(result.items.map(item => item.key)).toEqual(['a', 'custom'])
    expect(result.categories).toEqual([
      { name: 'Custom shelf', color: '#123456', icon: '✨', order: 1 },
      { name: 'Dairy', color: '#f0c96b', icon: '🥛', order: 2 }
    ])
    expect(result.categories).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Health' })]))
    expect(JSON.stringify(result)).not.toContain('Private medicine')
    expect(f.read(`users/${householdId}/members`)).toBeNull()
    expect(f.read(`users/${householdId}/invites`)).toBeNull()
    expect(f.read('users/guest@example_com/memberOf')).toBeNull()
  })

  it('lets an invited guest edit, add and delete only within A', async () => {
    const f = fixture()
    const shareId = await f.invite()
    const change = (mutation: unknown) => f.service.execute(guest, { action: 'mutate', shareId, mutation })
    await change({ operation: 'update', itemId: 'a', item: { bought: true, name: 'Milk 2L' } })
    expect(f.read(`users/${householdId}/groceries/a`)).toMatchObject({ bought: true, item: 'Milk 2L', list_name: 'A' })
    await change({ operation: 'add', item: { name: 'Eggs' } })
    expect(f.read(`users/${householdId}/groceries/added-1`)).toMatchObject({ item: 'Eggs', list_name: 'A', created_by: guest.email })
    await change({ operation: 'delete', itemId: 'a' })
    expect(f.read(`users/${householdId}/groceries/a`)).toBeNull()
    expect(f.read(`users/${householdId}/groceries/b`).item).toBe('Private medicine')
  })

  it.each(['update', 'delete'])('rejects a forged %s of an item from B', async operation => {
    const f = fixture()
    const shareId = await f.invite()
    await expect(f.service.execute(guest, { action: 'mutate', shareId, mutation: {
      operation, itemId: 'b', ...(operation === 'update' ? { item: { bought: true } } : {})
    } })).rejects.toMatchObject({ code: 'forbidden' })
    expect(f.read(`users/${householdId}/groceries/b`).bought).toBe(false)
  })

  it('rejects access to B even if its share ID is known', async () => {
    const f = fixture()
    await f.invite()
    const other = await f.service.execute(owner, f.request('roster', { listName: 'B' })) as ShoppingShareSnapshot
    await expect(f.service.execute(guest, { action: 'snapshot', shareId: other.id })).rejects.toMatchObject({ code: 'forbidden' })
    expect((await f.service.discover(guest)).map(share => share.name)).toEqual(['A'])
  })

  it('rechecks the current item scope after an owner moves it out of A', async () => {
    const f = fixture()
    const shareId = await f.invite()
    f.write(`users/${householdId}/groceries/a/list_name`, 'B')
    await expect(f.service.execute(guest, { action: 'mutate', shareId, mutation: { operation: 'update', itemId: 'a', item: { bought: true } } })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('revokes discovery, reads and writes without affecting a different share', async () => {
    const f = fixture()
    const shareId = await f.invite()
    await f.service.execute(owner, f.request('invite', { listName: 'B', email: guest.email }))
    await f.service.execute(owner, f.request('revoke', { email: guest.email }))
    expect((await f.service.discover(guest)).map(share => share.name)).toEqual(['B'])
    await expect(f.service.execute(guest, { action: 'snapshot', shareId })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(f.service.execute(guest, { action: 'mutate', shareId, mutation: { operation: 'add', item: { name: 'No' } } })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('never lets an invited editor invite or revoke people', async () => {
    const f = fixture()
    await f.invite()
    for (const action of ['invite', 'revoke', 'roster']) {
      await expect(f.service.execute(guest, f.request(action, action === 'roster' ? {} : { email: stranger.email }))).rejects.toMatchObject({ code: 'forbidden' })
    }
  })

  it('denies unverified identities and email-key impersonation', async () => {
    const f = fixture()
    const shareId = await f.invite()
    await expect(f.service.execute({ ...guest, emailVerified: false }, { action: 'snapshot', shareId })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(f.service.execute({ ...owner, uid: 'different-uid' }, f.request('roster'))).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('denies stale grants after ownership changes and stranger reads', async () => {
    const f = fixture()
    const shareId = await f.invite()
    await expect(f.service.execute(stranger, { action: 'snapshot', shareId })).rejects.toMatchObject({ code: 'forbidden' })
    f.write(`users/${householdId}/ownerUid`, 'new-owner')
    await expect(f.service.execute(guest, { action: 'snapshot', shareId })).rejects.toMatchObject({ code: 'forbidden' })
    expect(await f.service.discover(guest)).toEqual([])
  })

  it('rejects scope injection, arbitrary fields and Firebase path traversal', async () => {
    const f = fixture()
    const shareId = await f.invite()
    for (const mutation of [
      { operation: 'add', item: { name: 'Evil', list_name: 'B' } },
      { operation: 'update', itemId: 'a', item: { listName: 'B' } },
      { operation: 'delete', itemId: '../b' },
      { operation: 'update', itemId: 'a', item: { ownerUid: guest.uid } }
    ]) await expect(f.service.execute(guest, { action: 'mutate', shareId, mutation })).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('keeps the permanent list isolated from named lists', async () => {
    const f = fixture()
    await f.service.execute(owner, f.request('invite', { listName: null, email: guest.email }))
    const shareId = (await f.service.discover(guest))[0].id
    const result = await f.service.execute(guest, { action: 'snapshot', shareId }) as ShoppingShareSnapshot
    expect(result.items.map(item => item.key)).toEqual(['permanent'])
  })

  it('handles Firebase omitting a null permanent-list scope from stored objects', async () => {
    const f = fixture()
    await f.service.execute(owner, f.request('invite', { listName: null, email: guest.email }))
    const shareId = (await f.service.discover(guest))[0].id
    f.write(`shoppingListShares/${shareId}/listName`, null)
    const result = await f.service.execute(guest, { action: 'snapshot', shareId }) as ShoppingShareSnapshot
    expect(result.items.map(item => item.key)).toEqual(['permanent'])
    await f.service.execute(guest, { action: 'mutate', shareId, mutation: { operation: 'add', item: { name: 'Permanent eggs' } } })
    expect(f.read(`users/${householdId}/groceries/added-1`).list_name).toBeNull()
  })

  it('rejects updates of missing items without creating a replacement', async () => {
    const f = fixture()
    const shareId = await f.invite()
    await expect(f.service.execute(guest, { action: 'mutate', shareId, mutation: { operation: 'update', itemId: 'missing', item: { bought: true } } })).rejects.toMatchObject({ code: 'forbidden' })
    expect(f.read(`users/${householdId}/groceries/missing`)).toBeNull()
  })

  it('keeps repeated invitations idempotent and supports someone who has not signed up', async () => {
    const f = fixture()
    f.auth.getUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' })
    await f.invite()
    const shareId = await f.invite()
    expect(await f.service.discover(guest)).toHaveLength(1)
    const result = await f.service.execute(guest, { action: 'snapshot', shareId }) as ShoppingShareSnapshot
    expect(result.members).toEqual([{ email: guest.email, displayName: guest.email, photoURL: null }])
  })
})
