jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { FirebaseSdkGroceryRepository } from './firebaseSdkGroceryRepository.server'

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
