import type { CatalogAuthorizationRepository } from '../catalog'
import type { RequestContext } from '../shared'
import { MemberCommandService, type MemberCommandRepository } from './memberCommands.service'

const context: RequestContext = {
  principal: { kind: 'user', uid: 'owner-1', email: 'owner@example.com', emailVerified: true },
  requestId: 'request-1',
  now: new Date('2026-11-05T00:00:00.000Z')
}

const authorization = (): CatalogAuthorizationRepository => ({
  assertAccessible: jest.fn(),
  assertOwner: jest.fn().mockResolvedValue(undefined)
})

const repository = (): MemberCommandRepository => ({
  invite: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined)
})

describe('MemberCommandService', () => {
  it('normalizes an invitation and preserves both membership identities', async () => {
    const access = authorization()
    const persistence = repository()
    const service = new MemberCommandService(persistence, access)

    await service.invite(context, 'list-1', { email: ' Recipient.Name+shop@Example.COM ' })

    expect(access.assertOwner).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(persistence.invite).toHaveBeenCalledWith(
      'list-1',
      'recipient_name+shop@example_com',
      'recipient.name+shop@example.com',
      'owner@example.com',
      '2026-11-05T00:00:00.000Z'
    )
  })

  it('normalizes removal and preserves owner authorization', async () => {
    const access = authorization()
    const persistence = repository()
    const service = new MemberCommandService(persistence, access)

    await service.remove(context, 'list-1', ' Recipient.Name@Example.COM ')

    expect(access.assertOwner).toHaveBeenCalledWith(context.principal, 'list-1')
    expect(persistence.remove).toHaveBeenCalledWith('list-1', 'recipient_name@example_com')
  })

  it('does not persist when owner authorization fails', async () => {
    const access = authorization()
    ;(access.assertOwner as jest.Mock).mockRejectedValue(new Error('forbidden'))
    const persistence = repository()
    const service = new MemberCommandService(persistence, access)

    await expect(service.invite(context, 'list-1', { email: 'recipient@example.com' })).rejects.toThrow('forbidden')
    expect(persistence.invite).not.toHaveBeenCalled()
  })
})
