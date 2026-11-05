jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseSdkGroceryRepository } from './firebaseSdkGroceryRepository.server'

const record = {
  item: 'Milk', category: 'Dairy', added_at: '2026-08-02T10:30:00.000Z',
  raw_text: null, bought: false as const, created_by: 'user@example.com'
}

const concurrentDatabase = (initial: Record<string, unknown> = {}) => {
  let user = JSON.parse(JSON.stringify(initial)) as Record<string, unknown>
  let queue = Promise.resolve()
  let callers = 0
  return {
    database: {
      ref: jest.fn((path: string) => ({
        transaction: async (update: (current: Record<string, unknown>) => Record<string, unknown> | undefined) => {
          expect(path).toBe('users/household')
          callers += 1
          const previous = queue
          let release!: () => void
          queue = new Promise<void>((resolve) => { release = resolve })
          await previous
          const next = update(user)
          if (next !== undefined) user = next
          release()
          return { committed: next !== undefined, snapshot: { exists: () => true, val: () => user } }
        }
      }))
    },
    state: () => user,
    callers: () => callers
  }
}

it.each(['', '../outside', 'nested/item', 'bad.key'])('rejects invalid item keys before constructing a database reference: %p', async (itemId) => {
  const ref = jest.fn()
  const repository = new FirebaseSdkGroceryRepository({ ref } as any)
  await expect(repository.delete('household', itemId)).rejects.toMatchObject({ code: 'invalid_input' })
  await expect(repository.update('household', itemId, { bought: true })).rejects.toMatchObject({ code: 'invalid_input' })
  expect(ref).not.toHaveBeenCalled()
})

it('maps database failure to a stable application error', async () => {
  const repository = new FirebaseSdkGroceryRepository({
    ref: () => ({ remove: async () => { throw new Error('synthetic provider failure') } })
  } as any)
  await expect(repository.delete('household', 'item')).rejects.toMatchObject({
    code: 'upstream_failed', message: 'Grocery persistence failed'
  })
})

it('atomically converges simultaneous differently identified callers on one active item', async () => {
  const fake = concurrentDatabase()
  const repository = new FirebaseSdkGroceryRepository(fake.database as any)

  const keys = await Promise.all([
    repository.insertActiveUnique('household', 'milk', 'user:operation-00000001', record),
    repository.insertActiveUnique('household', 'milk', 'user:operation-00000002', record)
  ])

  expect(fake.callers()).toBe(2)
  expect(keys[0]).toBe(keys[1])
  expect(Object.values((fake.state().groceries ?? {}) as object)).toHaveLength(1)
  expect(Object.values((fake.state().grocery_operations ?? {}) as object)).toHaveLength(2)
})

it('preserves identical operation replay and rejects a changed fingerprint', async () => {
  const fake = concurrentDatabase()
  const repository = new FirebaseSdkGroceryRepository(fake.database as any)
  const operation = 'user:operation-00000001'

  const first = await repository.insertActiveUnique('household', 'milk', operation, record)
  await expect(repository.insertActiveUnique('household', 'milk', operation, {
    ...record, added_at: '2026-08-02T10:31:00.000Z'
  })).resolves.toBe(first)
  await expect(repository.insertActiveUnique('household', 'milk', operation, {
    ...record, category: 'Other'
  })).rejects.toMatchObject({ code: 'conflict' })
  expect(Object.values((fake.state().groceries ?? {}) as object)).toHaveLength(1)
})

it('rechecks a corrected normalized name and returns the current active key', async () => {
  const fake = concurrentDatabase({
    groceries: { existing: { ...record, item: ' MILK ' } }
  })
  const repository = new FirebaseSdkGroceryRepository(fake.database as any)

  await expect(repository.insertActiveUnique('household', 'milk', null, record)).resolves.toBe('existing')
  expect(Object.keys((fake.state().groceries ?? {}) as object)).toEqual(['existing'])
})

it('never restores a purchased deterministic row', async () => {
  const purchasedId = 'active_8825e76530f87ff5c737b3254c6936bc0a90bba3a10a91bbba739268208d378a'
  const fake = concurrentDatabase({ groceries: { [purchasedId]: { ...record, bought: true } } })
  const repository = new FirebaseSdkGroceryRepository(fake.database as any)

  await expect(repository.insertActiveUnique('household', 'milk', null, record)).resolves.toBe(`${purchasedId}_1`)
  expect(((fake.state().groceries as Record<string, any>)[purchasedId]).bought).toBe(true)
})
