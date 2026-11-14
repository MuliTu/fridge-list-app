import { deserialize, serialize } from 'node:v8'
import type { MutateList } from '../../shared/server'
import { FirebaseShoppingSharingService } from './firebaseShoppingSharing.server'

const clone = <Value,>(value: Value): Value => deserialize(serialize(value))

export const owner = { kind: 'user' as const, uid: 'owner-uid', email: 'owner@example.com', emailVerified: true }
export const guest = { kind: 'user' as const, uid: 'guest-uid', email: 'guest@example.com', emailVerified: true }
export const stranger = { kind: 'user' as const, uid: 'stranger-uid', email: 'stranger@example.com', emailVerified: true }
export const householdId = 'owner@example_com'

// A stateful repository double exercises authorization across successive calls,
// including revocation and items moved after a guest opened a list.
export function fixture() {
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
    else node[segments.at(-1)!] = clone(value)
  }
  let pushed = 0
  const reference = (path = ''): any => ({
    get: async () => ({ val: () => clone(read(path)), exists: () => read(path) !== null }),
    child: (key: string) => reference(`${path}/${key}`),
    update: async (updates: Record<string, unknown>) => { for (const [key, value] of Object.entries(updates)) write(path ? `${path}/${key}` : key, value) },
    push: (value?: unknown) => {
      const key = `added-${++pushed}`
      if (value !== undefined) write(`${path}/${key}`, value)
      return { key }
    },
    transaction: async (update: (value: any) => any) => {
      const value = update(clone(read(path)))
      if (value === undefined) return { committed: false }
      write(path, value)
      return { committed: true }
    }
  })
  const db = { ref: jest.fn(reference) }
  const auth: any = { getUserByEmail: jest.fn(async (email: string) => ({ displayName: email.split('@')[0], photoURL: 'https://example.com/avatar.png' })) }
  const mutateHousehold: MutateList = async (id, mutate) => {
    const path = `users/${id}`
    const change = mutate(clone(read(path)))
    if (!change) return undefined
    write(path, change.value)
    return change.result
  }
  const service = new FirebaseShoppingSharingService(db as any, auth, mutateHousehold)
  const request = (action: string, fields = {}) => ({ action, householdId, listName: 'A', ...fields })
  const invite = async () => {
    await service.execute(owner, request('invite', { email: guest.email }))
    return (await service.discover(guest))[0].id
  }
  return { state, read, write, service, request, invite, db, auth }
}
