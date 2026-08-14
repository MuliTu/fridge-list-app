import type { ListAuthorizationRepository } from '../../groceries'
import type { RequestContext } from '../../shared'
import { StockCommandService } from './stockCommands.service'
import type { StockRepository } from './stockRepository'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'user-1', email: 'user@example.com', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-08-02T10:00:00.000Z')
}

const dependencies = () => ({
  repository: {
    insert: jest.fn(), update: jest.fn(), delete: jest.fn(), list: jest.fn()
  } as jest.Mocked<StockRepository>,
  authorization: { assertAccessible: jest.fn() } as jest.Mocked<ListAuthorizationRepository>
})

describe('StockCommandService', () => {
  it('creates the existing RTDB record shape after authorization', async () => {
    const { repository, authorization } = dependencies()
    repository.insert.mockResolvedValue('stock-1')
    const service = new StockCommandService(repository, authorization)

    await expect(service.create(context, 'list-1', {
      name: ' Milk ', category: ' Dairy ', quantity: 2, unit: 'pcs', lowThreshold: 1
    })).resolves.toEqual({ key: 'stock-1' })

    expect(authorization.assertAccessible).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(repository.insert).toHaveBeenCalledWith('list-1', {
      name: 'Milk', category: 'Dairy', quantity: 2, unit: 'pcs', low_threshold: 1,
      updated_at: '2026-08-02T10:00:00.000Z', updated_by: 'user@example.com'
    })
  })

  it.each([
    ['negative quantity', { name: 'Milk', category: 'Dairy', quantity: -1, unit: 'pcs', lowThreshold: 1 }],
    ['infinite quantity', { name: 'Milk', category: 'Dairy', quantity: Infinity, unit: 'pcs', lowThreshold: 1 }],
    ['negative threshold', { name: 'Milk', category: 'Dairy', quantity: 1, unit: 'pcs', lowThreshold: -1 }]
  ])('rejects %s without persistence', async (_case, input) => {
    const { repository, authorization } = dependencies()
    await expect(new StockCommandService(repository, authorization).create(context, 'list-1', input)).rejects.toEqual(
      expect.objectContaining({ code: 'invalid_input' })
    )
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('updates and deletes only after list authorization', async () => {
    const { repository, authorization } = dependencies()
    const service = new StockCommandService(repository, authorization)

    await service.update(context, 'list-1', 'stock-1', { quantity: 0, lowThreshold: 2 })
    await service.delete(context, 'list-1', 'stock-1')

    expect(authorization.assertAccessible).toHaveBeenCalledTimes(2)
    expect(repository.update).toHaveBeenCalledWith('list-1', 'stock-1', {
      quantity: 0, low_threshold: 2,
      updated_at: '2026-08-02T10:00:00.000Z', updated_by: 'user@example.com'
    })
    expect(repository.delete).toHaveBeenCalledWith('list-1', 'stock-1')
  })

  it('suggests a stock match provider-free using normalized grocery text', async () => {
    const { repository, authorization } = dependencies()
    const milk = {
      key: 'stock-1', name: 'חלב  טרי', category: 'מוצרי חלב', quantity: 1, unit: 'יח׳',
      low_threshold: 1, updated_at: '2026-08-02T10:00:00Z', updated_by: null
    }
    repository.list.mockResolvedValue([milk])

    await expect(new StockCommandService(repository, authorization).suggestForGrocery(
      context, 'list-1', '  חלב טרי '
    )).resolves.toEqual(milk)
  })

  it('rejects a non-member before persistence, reads, or validation disclosure', async () => {
    const { repository, authorization } = dependencies()
    authorization.assertAccessible.mockRejectedValue({ code: 'forbidden' })

    await expect(new StockCommandService(repository, authorization).create(context, 'list-1', {
      name: '', category: '', quantity: -1, unit: '', lowThreshold: -1
    })).rejects.toEqual(expect.objectContaining({ code: 'forbidden' }))
    expect(repository.insert).not.toHaveBeenCalled()
    expect(repository.list).not.toHaveBeenCalled()
  })
})
