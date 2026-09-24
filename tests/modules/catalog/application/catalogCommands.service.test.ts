import type { RequestContext } from '../../../../src/modules/shared'
import type { CatalogAuthorizationRepository } from '../../../../src/modules/catalog/application/catalogAuthorizationRepository'
import type { CatalogCommandRepository } from '../../../../src/modules/catalog/application/catalogCommandRepository'
import { CatalogCommandService } from '../../../../src/modules/catalog/application/catalogCommands.service'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'user-1', email: 'owner@example.com', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-08-14T09:00:00Z')
}

const dependencies = () => ({
  repository: {
    insert: jest.fn().mockResolvedValue('category-1'), update: jest.fn(), reorder: jest.fn(),
    deleteAndReassignToOthers: jest.fn()
  } as jest.Mocked<CatalogCommandRepository>,
  authorization: { assertAccessible: jest.fn(), assertOwner: jest.fn() } as jest.Mocked<CatalogAuthorizationRepository>
})

describe('CatalogCommandService', () => {
  it('creates an unprotected category after verifying list access', async () => {
    const { repository, authorization } = dependencies()
    const service = new CatalogCommandService(repository, authorization)

    await expect(service.create(context, 'list-1', {
      name: ' Produce ', color: ' green ', icon: '', order: 2
    })).resolves.toEqual({ key: 'category-1' })

    expect(authorization.assertAccessible).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(repository.insert).toHaveBeenCalledWith('list-1', {
      name: 'Produce', color: 'green', icon: '📌', order: 2, protected: false
    })
  })

  it('updates and atomically reorders categories through the repository', async () => {
    const { repository, authorization } = dependencies()
    const service = new CatalogCommandService(repository, authorization)

    await service.update(context, 'list-1', 'produce', { name: 'Fruit', order: 3 })
    await service.reorder(context, 'list-1', { produce: 1, dairy: 2, other: 3 })

    expect(authorization.assertAccessible).toHaveBeenCalledTimes(2)
    expect(repository.update).toHaveBeenCalledWith('list-1', 'produce', { name: 'Fruit', order: 3 })
    expect(repository.reorder).toHaveBeenCalledWith('list-1', { produce: 1, dairy: 2, other: 3 })
  })

  it('requires ownership before delete and delegates atomic reassignment', async () => {
    const { repository, authorization } = dependencies()
    const service = new CatalogCommandService(repository, authorization)

    await service.delete(context, 'list-1', 'produce')

    expect(authorization.assertOwner).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(repository.deleteAndReassignToOthers).toHaveBeenCalledWith('list-1', 'produce')
  })

  it('never permits the protected Others key to be changed or deleted', async () => {
    const { repository, authorization } = dependencies()
    const service = new CatalogCommandService(repository, authorization)

    await expect(service.update(context, 'list-1', 'other', { name: 'Anything' }))
      .rejects.toMatchObject({ code: 'conflict' })
    await expect(service.delete(context, 'list-1', 'other'))
      .rejects.toMatchObject({ code: 'conflict' })
    expect(repository.update).not.toHaveBeenCalled()
    expect(repository.deleteAndReassignToOthers).not.toHaveBeenCalled()
  })

  it('prevents duplicate use of the protected Others display name', async () => {
    const { repository, authorization } = dependencies()
    const service = new CatalogCommandService(repository, authorization)

    await expect(service.create(context, 'list-1', {
      name: 'אחר', color: '#aaa', order: 4
    })).rejects.toMatchObject({ code: 'conflict' })
    await expect(service.update(context, 'list-1', 'produce', { name: 'אחר' }))
      .rejects.toMatchObject({ code: 'conflict' })
    expect(repository.insert).not.toHaveBeenCalled()
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('does not reveal or persist delete details to a non-owner', async () => {
    const { repository, authorization } = dependencies()
    authorization.assertOwner.mockRejectedValue({ code: 'forbidden' })

    await expect(new CatalogCommandService(repository, authorization).delete(context, 'list-1', 'bad/key'))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(repository.deleteAndReassignToOthers).not.toHaveBeenCalled()
  })
})
