import { ListDeletionService, type ListDeletionRepository } from './listDeletion.service'

const context = (uid = 'owner-uid') => ({
  principal: { kind: 'user' as const, uid, email: 'owner@example.com', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-11-07T12:00:00Z')
})

it('passes only bounded server-derived actor and exact list identity to persistence', async () => {
  const repository: jest.Mocked<ListDeletionRepository> = { deleteCustomList: jest.fn().mockResolvedValue({ deletedItems: 2 }) }
  await expect(new ListDeletionService(repository).delete(context(), 'owner_example_com', ' Camping '))
    .resolves.toEqual({ deletedItems: 2 })
  expect(repository.deleteCustomList).toHaveBeenCalledWith({ listId: 'owner_example_com', listName: 'Camping', actorUid: 'owner-uid' })
})

it.each([
  ['', 'Camping'], ['forged/list', 'Camping'], ['owner_example_com', ''], ['owner_example_com', '\u0000bad']
])('rejects malformed identifiers before persistence', async (listId, listName) => {
  const repository: jest.Mocked<ListDeletionRepository> = { deleteCustomList: jest.fn() }
  await expect(new ListDeletionService(repository).delete(context(), listId, listName)).rejects.toMatchObject({ code: 'invalid_input' })
  expect(repository.deleteCustomList).not.toHaveBeenCalled()
})
