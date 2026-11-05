import type { ListAuthorizationRepository } from '../groceries'
import type { RequestContext } from '../shared'
import { HouseholdSnapshotService, type HouseholdSnapshotRepository } from './householdSnapshot.service'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'recipient-1', email: 'recipient@example.com', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-11-05T00:00:00.000Z')
}

describe('HouseholdSnapshotService', () => {
  it('authorizes the exact list before returning the repository snapshot', async () => {
    const authorization: ListAuthorizationRepository = { assertAccessible: jest.fn().mockResolvedValue(undefined) }
    const repository: HouseholdSnapshotRepository = {
      get: jest.fn().mockResolvedValue({ groceries: { item1: { item: 'Milk' } } })
    }
    const service = new HouseholdSnapshotService(repository, authorization)

    await expect(service.get(context, 'list-1')).resolves.toEqual({ groceries: { item1: { item: 'Milk' } } })
    expect(authorization.assertAccessible).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(repository.get).toHaveBeenCalledWith('list-1')
    expect((authorization.assertAccessible as jest.Mock).mock.invocationCallOrder[0])
      .toBeLessThan((repository.get as jest.Mock).mock.invocationCallOrder[0])
  })

  it('does not read the snapshot when authorization fails', async () => {
    const authorization: ListAuthorizationRepository = {
      assertAccessible: jest.fn().mockRejectedValue(new Error('forbidden'))
    }
    const repository: HouseholdSnapshotRepository = { get: jest.fn() }
    const service = new HouseholdSnapshotService(repository, authorization)

    await expect(service.get(context, 'list-2')).rejects.toThrow('forbidden')
    expect(repository.get).not.toHaveBeenCalled()
  })
})
