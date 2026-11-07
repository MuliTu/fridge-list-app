import type { CatalogAuthorizationRepository } from '../catalog'
import { ApplicationError, type RequestContext } from '../shared'
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
  getList: jest.fn().mockResolvedValue({
    name: 'List',
    normalizedOwnerEmail: 'owner@example.com',
    ownerUid: 'owner-1',
    invites: {}
  }),
  getMembership: jest.fn().mockResolvedValue(null),
  invite: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  updateNotificationLanguage: jest.fn().mockResolvedValue(true)
})

const grantRecipient = (
  persistence: MemberCommandRepository,
  membership: unknown = 'approved',
  invite: unknown = { email: 'member@example.com', status: 'approved' }
) => {
  ;(persistence.getList as jest.Mock).mockResolvedValue({
    name: 'Shared',
    ownerUid: 'owner-1',
    normalizedOwnerEmail: 'first_last@example.com',
    invites: { 'member@example_com': invite }
  })
  ;(persistence.getMembership as jest.Mock).mockResolvedValue(membership)
}

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
      '2026-11-05T00:00:00.000Z',
      'he'
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

  it('returns an owner roster without reconstructing underscore email keys', async () => {
    const persistence = repository()
    ;(persistence.getList as jest.Mock).mockResolvedValue({
      name: 'Mine',
      ownerUid: 'owner-1',
      normalizedOwnerEmail: 'first_last@example.com',
      invites: {
        'guest_name@example_com': {
          email: 'guest_name@example.com',
          status: 'approved',
          notificationLanguage: 'en'
        }
      }
    })
    const service = new MemberCommandService(persistence, authorization())
    const underscoreContext = {
      ...context,
      principal: { kind: 'user', uid: 'owner-1', email: 'first_last@example.com', emailVerified: true }
    } satisfies RequestContext

    await expect(service.getSummary(underscoreContext, 'first_last@example_com')).resolves.toEqual({
      listId: 'first_last@example_com',
      name: 'Mine',
      ownerEmail: 'first_last@example.com',
      isOwner: true,
      members: [{
        email: 'guest_name@example.com',
        status: 'approved',
        notificationLanguage: 'en'
      }]
    })
  })

  it('authorizes an unbound legacy owner only from an exact normalized email', async () => {
    const persistence = repository()
    ;(persistence.getList as jest.Mock).mockResolvedValue({
      name: 'Legacy list',
      normalizedOwnerEmail: 'first.last@example.com',
      invites: {}
    })
    const service = new MemberCommandService(persistence, authorization())
    const legacyOwnerContext = {
      ...context,
      principal: { kind: 'user', uid: 'legacy-owner', email: 'FIRST.LAST@example.com', emailVerified: true }
    } satisfies RequestContext

    await expect(service.getSummary(legacyOwnerContext, 'first_last@example_com')).resolves.toMatchObject({
      ownerEmail: 'first.last@example.com', isOwner: true
    })
  })

  it('does not claim an unbound legacy list through a sanitized email collision', async () => {
    const persistence = repository()
    ;(persistence.getList as jest.Mock).mockResolvedValue({
      name: 'Collision target',
      normalizedOwnerEmail: 'first_last@example.com',
      invites: {}
    })
    const service = new MemberCommandService(persistence, authorization())
    const collidingContext = {
      ...context,
      principal: { kind: 'user', uid: 'attacker', email: 'first.last@example.com', emailVerified: true }
    } satisfies RequestContext

    await expect(service.getSummary(collidingContext, 'first_last@example_com'))
      .rejects.toMatchObject({ code: 'forbidden' })
    await expect(service.leave(collidingContext, 'first_last@example_com'))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(persistence.remove).not.toHaveBeenCalled()
  })

  it('returns the same denial for missing and inaccessible lists', async () => {
    const missingRepository = repository()
    ;(missingRepository.getList as jest.Mock).mockResolvedValue(null)
    const inaccessibleRepository = repository()
    grantRecipient(inaccessibleRepository, null)
    const recipientContext = {
      ...context,
      principal: { kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: true }
    } satisfies RequestContext

    for (const persistence of [missingRepository, inaccessibleRepository]) {
      const service = new MemberCommandService(persistence, authorization())
      await expect(service.getSummary(recipientContext, 'unknown@example_com'))
        .rejects.toMatchObject({
          code: 'forbidden',
          message: 'User cannot manage this list membership'
        })
      await expect(service.leave(recipientContext, 'unknown@example_com'))
        .rejects.toMatchObject({
          code: 'forbidden',
          message: 'User cannot manage this list membership'
        })
    }
  })

  it.each([
    ['legacy string', 'approved'],
    ['object record', { ownerEmail: 'first_last@example.com', status: 'approved' }]
  ])('keeps recipient summaries roster-free for %s memberOf data', async (_label, membership) => {
    const persistence = repository()
    grantRecipient(persistence, membership)
    const access = authorization()
    const service = new MemberCommandService(persistence, access)
    const recipientContext = {
      ...context,
      principal: { kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: true }
    } satisfies RequestContext

    await expect(service.getSummary(recipientContext, 'first_last@example_com')).resolves.toMatchObject({
      ownerEmail: 'first_last@example.com', isOwner: false, members: []
    })
    expect(access.assertAccessible).not.toHaveBeenCalled()
  })

  it('derives self-leave identity and removes only the matching list grant', async () => {
    const persistence = repository()
    grantRecipient(persistence)
    const service = new MemberCommandService(persistence, authorization())
    const recipientContext = {
      ...context,
      principal: { kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: true }
    } satisfies RequestContext

    await service.leave(recipientContext, 'list-1')
    expect(persistence.remove).toHaveBeenCalledWith('list-1', 'member@example_com')
  })

  it.each([
    ['pending reverse membership', 'pending', { email: 'member@example.com', status: 'approved' }],
    ['missing reverse membership', null, { email: 'member@example.com', status: 'approved' }],
    ['pending owner invitation', 'approved', { email: 'member@example.com', status: 'pending' }],
    ['mismatched owner invitation', 'approved', { email: 'other@example.com', status: 'approved' }],
    ['one-sided legacy invitation', 'approved', null],
    ['malformed object membership', { status: 'approved' }, { email: 'member@example.com', status: 'approved' }],
    ['wrong object owner', { ownerEmail: 'other@example.com', status: 'approved' }, { email: 'member@example.com', status: 'approved' }]
  ])('denies recipient summary and leave for %s', async (_label, membership, invite) => {
    const persistence = repository()
    grantRecipient(persistence, membership, invite)
    const service = new MemberCommandService(persistence, authorization())
    const recipientContext = {
      ...context,
      principal: { kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: true }
    } satisfies RequestContext

    await expect(service.getSummary(recipientContext, 'first_last@example_com'))
      .rejects.toMatchObject({ code: 'forbidden' })
    await expect(service.leave(recipientContext, 'first_last@example_com'))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(persistence.remove).not.toHaveBeenCalled()
  })

  it('requires a verified email before reading membership data', async () => {
    const persistence = repository()
    const service = new MemberCommandService(persistence, authorization())
    const unverifiedContext = {
      ...context,
      principal: { kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: false }
    } satisfies RequestContext

    await expect(service.getSummary(unverifiedContext, 'first_last@example_com'))
      .rejects.toMatchObject({ code: 'forbidden' })
    expect(persistence.getList).not.toHaveBeenCalled()
    expect(persistence.getMembership).not.toHaveBeenCalled()
  })

  it('does not write when forged revoke or mismatched leave authorization fails', async () => {
    const access = authorization()
    const persistence = repository()
    const service = new MemberCommandService(persistence, access)
    ;(access.assertOwner as jest.Mock).mockRejectedValueOnce(new ApplicationError('forbidden', 'no'))
    await expect(service.remove(context, 'other-list', 'victim@example.com')).rejects.toMatchObject({ code: 'forbidden' })
    grantRecipient(persistence, 'pending')
    const recipientContext = {
      ...context,
      principal: { kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: true }
    } satisfies RequestContext
    await expect(service.leave(recipientContext, 'other-list')).rejects.toMatchObject({ code: 'forbidden' })
    expect(persistence.remove).not.toHaveBeenCalled()
  })

  it('refuses owner self-leave and missing language targets', async () => {
    const persistence = repository()
    const service = new MemberCommandService(persistence, authorization())
    await expect(service.leave(context, 'owner@example_com')).rejects.toMatchObject({ code: 'conflict' })
    ;(persistence.updateNotificationLanguage as jest.Mock).mockResolvedValue(false)
    await expect(service.updateNotificationLanguage(context, 'list-1', 'guest@example.com', {
      notificationLanguage: 'en'
    })).rejects.toMatchObject({ code: 'not_found' })
  })
})
