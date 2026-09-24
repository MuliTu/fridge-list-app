import type { RequestContext } from '../../shared'
import type { ListAuthorizationRepository } from '../../lists'
import type { GroceryReadRepository } from './groceryReadRepository'
import { GetGroceriesService } from './getGroceries.service'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'user-1', email: 'user@example.test', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-09-23T12:00:00.000Z')
}

describe('GetGroceriesService', () => {
  it('authorizes before reading groceries', async () => {
    const repository: jest.Mocked<GroceryReadRepository> = {
      list: jest.fn().mockResolvedValue([{ key: 'item-1', item: 'Milk' }])
    } as unknown as jest.Mocked<GroceryReadRepository>
    const authorization: jest.Mocked<ListAuthorizationRepository> = {
      assertListReadable: jest.fn().mockResolvedValue(undefined),
      assertListWritable: jest.fn(),
      assertListOwner: jest.fn(),
      assertOwnIdentity: jest.fn()
    }

    const result = await new GetGroceriesService(repository, authorization)
      .execute(context, 'list-1')

    expect(result).toEqual([{ key: 'item-1', item: 'Milk' }])
    expect(authorization.assertListReadable).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(repository.list).toHaveBeenCalledWith('list-1')
  })

  it('does not read when authorization fails', async () => {
    const repository: jest.Mocked<GroceryReadRepository> = {
      list: jest.fn()
    }
    const authorization: jest.Mocked<ListAuthorizationRepository> = {
      assertListReadable: jest.fn().mockRejectedValue({ code: 'forbidden' }),
      assertListWritable: jest.fn(),
      assertListOwner: jest.fn(),
      assertOwnIdentity: jest.fn()
    }

    await expect(
      new GetGroceriesService(repository, authorization).execute(context, 'list-1')
    ).rejects.toMatchObject({ code: 'forbidden' })
    expect(repository.list).not.toHaveBeenCalled()
  })
})
