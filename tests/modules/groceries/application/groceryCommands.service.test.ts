import type { RequestContext } from '../../../../src/modules/shared'
import { GroceryCommandService } from '../../../../src/modules/groceries/application/groceryCommands.service'
import type { GroceryRepository } from '../../../../src/modules/groceries/application/groceryWriteRepository'
import type { ListAuthorizationRepository } from '../../../../src/modules/groceries/application/listAuthorizationRepository'

const repository = (): jest.Mocked<GroceryRepository> => ({
  insert: jest.fn().mockResolvedValue('new-key'),
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
      quantity: 2,
      unit: ' l '
    })

    expect(access.assertAccessible).toHaveBeenCalledWith(context.principal, 'owner_email_com')
    expect(repo.insert).toHaveBeenCalledWith('owner_email_com', {
      item: 'Milk', category: 'Dairy', bought: false, added_at: '2026-08-02T10:30:00.000Z',
      raw_text: 'נוסף ידנית', list_name: null, created_by: 'user@example.com', quantity: 2, unit: 'l'
    })
    expect(result).toEqual({ key: 'new-key' })
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
})
