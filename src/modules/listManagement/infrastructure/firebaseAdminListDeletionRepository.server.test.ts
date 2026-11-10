/** @jest-environment node */
jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseAdminListDeletionRepository } from './firebaseAdminListDeletionRepository.server'

const setup = (value: unknown, committed = true) => {
  let written: unknown
  const transaction = jest.fn(async (update: (current: unknown) => unknown) => {
    written = update(value)
    return { committed: committed && written !== undefined }
  })
  const database = { ref: jest.fn(() => ({ transaction })) }
  return { repository: new FirebaseAdminListDeletionRepository(database as never), database, transaction, written: () => written }
}

it('atomically removes only matching custom-list groceries and preserves unrelated household data', async () => {
  const d = setup({ ownerUid: 'owner', name: 'Home', stock: { s: { name: 'Milk' } }, groceries: {
    a: { item: 'A', list_name: 'Camping' }, b: { item: 'B', list_name: 'Other' }, c: { item: 'C' }
  } })
  await expect(d.repository.deleteCustomList({ listId: 'house', listName: 'Camping', actorUid: 'owner' }))
    .resolves.toEqual({ deletedItems: 1 })
  expect(d.database.ref).toHaveBeenCalledWith('users/house')
  expect(d.written()).toEqual({ ownerUid: 'owner', name: 'Home', stock: { s: { name: 'Milk' } }, groceries: {
    b: { item: 'B', list_name: 'Other' }, c: { item: 'C' }
  } })
})

it.each([
  ['shared participant', 'other', { ownerUid: 'owner', groceries: { a: { list_name: 'Camping' } } }, 'forbidden'],
  ['forged household', 'owner', null, 'forbidden'],
  ['missing custom list', 'owner', { ownerUid: 'owner', groceries: { a: { list_name: 'Other' } } }, 'not_found']
])('denies %s without committing', async (_case, actorUid, value, code) => {
  const d = setup(value)
  await expect(d.repository.deleteCustomList({ listId: 'house', listName: 'Camping', actorUid })).rejects.toMatchObject({ code })
  expect([undefined, null]).toContain(d.written())
})

it('retries an uncached initial null with the actual remote household before deleting', async () => {
  const attempts: unknown[] = []
  const transaction = jest.fn(async (update: (current: unknown) => unknown) => {
    attempts.push(update(null))
    const final = update({ ownerUid: 'owner', groceries: {
      a: { item: 'Milk', list_name: 'Camping' },
      b: { item: 'Bread' }
    } })
    return { committed: final !== undefined }
  })
  const repository = new FirebaseAdminListDeletionRepository({ ref: () => ({ transaction }) } as never)
  await expect(repository.deleteCustomList({ listId: 'house', listName: 'Camping', actorUid: 'owner' }))
    .resolves.toEqual({ deletedItems: 1 })
  expect(attempts).toEqual([null])
})

it('uses the final transaction callback state when Firebase retries after a concurrent owner change', async () => {
  const transaction = jest.fn(async (update: (current: unknown) => unknown) => {
    update({ ownerUid: 'owner', groceries: { a: { list_name: 'Camping' } } })
    const final = update({ ownerUid: 'replacement', groceries: { a: { list_name: 'Camping' } } })
    return { committed: final !== undefined }
  })
  const repository = new FirebaseAdminListDeletionRepository({ ref: () => ({ transaction }) } as never)
  await expect(repository.deleteCustomList({ listId: 'house', listName: 'Camping', actorUid: 'owner' }))
    .rejects.toMatchObject({ code: 'forbidden' })
})
