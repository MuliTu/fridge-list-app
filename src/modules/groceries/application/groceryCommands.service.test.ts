import type { RequestContext } from '../../shared'
import { GroceryCommandService } from './groceryCommands.service'
import type { GroceryRepository } from './groceryWriteRepository'
import type { ListAuthorizationRepository } from './listAuthorizationRepository'

const repository = (): jest.Mocked<GroceryRepository> => ({
  insert: jest.fn().mockResolvedValue('new-key'),
  insertActiveUnique: jest.fn().mockResolvedValue('new-key'),
  insertIdempotent: jest.fn(),
  reactivate: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
})
const authorization = (): jest.Mocked<ListAuthorizationRepository> => ({ assertAccessible: jest.fn() })
const context: RequestContext = {
  principal: { kind: 'user', uid: 'user-1', email: 'user@example.com', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-08-02T10:30:00.000Z')
}

describe('GroceryCommandService', () => {
  it('authorizes before adding and preserves the existing RTDB record shape', async () => {
    const repo = repository()
    const access = authorization()
    const result = await new GroceryCommandService(repo, access).add(context, 'owner_email_com', {
      name: '  Milk ',
      category: ' Dairy ',
      listName: null,
      note: ' Buy fresh ',
      quantity: 2,
      unit: ' l '
    })

    expect(access.assertAccessible).toHaveBeenCalledWith(context.principal, 'owner_email_com', 'write')
    expect(repo.insertActiveUnique).toHaveBeenCalledWith('owner_email_com', 'milk', null, {
      item: 'Milk', category: 'Dairy', bought: false, added_at: '2026-08-02T10:30:00.000Z',
      raw_text: 'נוסף ידנית', list_name: null, created_by: 'user@example.com', note: 'Buy fresh', quantity: 2, unit: 'l'
    })
    expect(result).toEqual({ key: 'new-key' })
  })

  it('passes the actor-scoped operation to the atomic active-name boundary', async () => {
    const repo = repository()
    repo.insertActiveUnique.mockResolvedValue('stable-key')
    const result = await new GroceryCommandService(repo, authorization()).add(context, 'shared-list', {
      name: ' Milk ',
      category: 'Dairy',
      operationId: '00000000-0000-4000-8000-000000000001'
    })

    expect(repo.insertActiveUnique).toHaveBeenCalledWith(
      'shared-list',
      'milk',
      'user-1:00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ item: 'Milk' })
    )
    expect(result).toEqual({ key: 'stable-key' })
    expect(repo.insertIdempotent).not.toHaveBeenCalled()
  })

  it('authorizes update, purchased-state, detail, and delete commands', async () => {
    const repo = repository()
    const access = authorization()
    const service = new GroceryCommandService(repo, access)

    await service.update(context, 'list', 'item', { category: 'Produce' })
    await service.setPurchased(context, 'list', 'item', true)
    await service.updateDetails(context, 'list', 'item', { note: null, quantity: 3, unit: 'kg' })
    await service.delete(context, 'list', 'item')

    expect(access.assertAccessible).toHaveBeenCalledTimes(4)
    expect(repo.update).toHaveBeenNthCalledWith(1, 'list', 'item', {
      category: 'Produce', modified_at: context.now.toISOString(), modified_by: 'user@example.com'
    })
    expect(repo.update).toHaveBeenNthCalledWith(2, 'list', 'item', {
      bought: true, modified_at: context.now.toISOString(), modified_by: 'user@example.com'
    })
    expect(repo.update).toHaveBeenNthCalledWith(3, 'list', 'item', {
      note: null, quantity: 3, unit: 'kg', modified_at: context.now.toISOString(), modified_by: 'user@example.com'
    })
    expect(repo.delete).toHaveBeenCalledWith('list', 'item')
  })

  it('does not touch persistence when list authorization fails', async () => {
    const repo = repository()
    const access = authorization()
    access.assertAccessible.mockRejectedValue({ code: 'forbidden' })

    await expect(new GroceryCommandService(repo, access).delete(context, 'list', 'item')).rejects.toMatchObject({
      code: 'forbidden'
    })
    expect(repo.delete).not.toHaveBeenCalled()
  })

  it('does not inspect or write groceries when add authorization fails', async () => {
    const repo = repository()
    const access = authorization()
    access.assertAccessible.mockRejectedValue({ code: 'forbidden' })

    await expect(new GroceryCommandService(repo, access).add(context, 'forged-list', {
      name: 'Milk', category: 'Dairy'
    })).rejects.toMatchObject({ code: 'forbidden' })
    expect(repo.insertActiveUnique).not.toHaveBeenCalled()
  })
})

it('authorizes and persists urgency through the normal command path', async () => {
  const repo = repository()
  const access = authorization()
  const service = new GroceryCommandService(repo, access)
  await service.update(context, 'list', 'item', { urgency: 'urgent' })
  expect(access.assertAccessible).toHaveBeenCalledWith(context.principal, 'list', 'write')
  expect(repo.update).toHaveBeenCalledWith('list', 'item', expect.objectContaining({ urgency: 'urgent' }))
  await service.updateDetails(context, 'list', 'item', { urgency: 'wanted', note: 'Soon' })
  expect(repo.update).toHaveBeenLastCalledWith('list', 'item', expect.objectContaining({ urgency: 'wanted', note: 'Soon' }))
})
it.each([null, 3, 'highest', {}, true])('rejects invalid urgency %p without writing', async urgency => {
  const repo = repository()
  await expect(new GroceryCommandService(repo, authorization()).update(context, 'list', 'item', { urgency })).rejects.toMatchObject({ code: 'invalid_input' })
  expect(repo.update).not.toHaveBeenCalled()
})
it('does not persist urgency if authorization fails', async () => {
  const repo = repository()
  const access = authorization()
  access.assertAccessible.mockRejectedValue({ code: 'forbidden' })
  await expect(new GroceryCommandService(repo, access).update(context, 'list', 'item', { urgency: 'urgent' })).rejects.toMatchObject({ code: 'forbidden' })
  expect(repo.update).not.toHaveBeenCalled()
})
