/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { AuthenticatedUserHandler } from '../identity/server'
import { ApplicationError } from '../shared'
import type { MemberCommandService } from './memberCommands.service'
import {
  createMemberInviteDeleteHandler,
  createMemberLanguagePatchHandler,
  createMemberLeaveDeleteHandler,
  createMemberSummaryGetHandler
} from './memberHttp.server'

const authenticated = () => new AuthenticatedUserHandler({
  authenticationService: {
    execute: jest.fn().mockResolvedValue({
      kind: 'user', uid: 'member-1', email: 'member@example.com', emailVerified: true
    })
  },
  generateRequestId: () => 'request-1'
})

const request = (method: string, body?: unknown, authorization = 'Bearer token') => new Request(
  'http://localhost/api/lists/list-a/members',
  {
    method,
    headers: {
      authorization,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  }
)

const service = () => ({
  getSummary: jest.fn(),
  invite: jest.fn(),
  remove: jest.fn(),
  updateNotificationLanguage: jest.fn(),
  leave: jest.fn()
}) as unknown as jest.Mocked<MemberCommandService>

describe('member HTTP authorization boundary', () => {
  it('returns 401 before reading a roster when authentication fails', async () => {
    const memberService = service()
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockRejectedValue(new ApplicationError('unauthenticated', 'Missing token'))
      }
    })
    const response = await createMemberSummaryGetHandler({ authenticatedUserHandler, service: memberService })({
      request: request('GET', undefined, ''), listId: 'list-a'
    })
    expect(response.status).toBe(401)
    expect(memberService.getSummary).not.toHaveBeenCalled()
  })

  it('passes the authenticated identity to exact-list summary and self-leave commands', async () => {
    const memberService = service()
    memberService.getSummary.mockResolvedValue({
      listId: 'list-a', name: 'A', ownerEmail: 'owner@example.com', isOwner: false, members: []
    })
    const dependencies = { authenticatedUserHandler: authenticated(), service: memberService }
    expect((await createMemberSummaryGetHandler(dependencies)({ request: request('GET'), listId: 'list-a' })).status).toBe(200)
    expect((await createMemberLeaveDeleteHandler(dependencies)({ request: request('DELETE'), listId: 'list-a' })).status).toBe(204)
    expect(memberService.getSummary).toHaveBeenCalledWith(expect.objectContaining({
      principal: expect.objectContaining({ uid: 'member-1' })
    }), 'list-a')
    expect(memberService.leave).toHaveBeenCalledWith(expect.objectContaining({
      principal: expect.objectContaining({ email: 'member@example.com' })
    }), 'list-a')
  })

  it('keeps forged cross-list revoke and language failures as 403 responses', async () => {
    const memberService = service()
    memberService.remove.mockRejectedValue(new ApplicationError('forbidden', 'Only owner'))
    memberService.updateNotificationLanguage.mockRejectedValue(new ApplicationError('forbidden', 'Only owner'))
    const dependencies = { authenticatedUserHandler: authenticated(), service: memberService }
    const revoke = await createMemberInviteDeleteHandler(dependencies)({
      request: request('DELETE'), listId: 'other-list', email: encodeURIComponent('victim@example.com')
    })
    const language = await createMemberLanguagePatchHandler(dependencies)({
      request: request('PATCH', { notificationLanguage: 'en' }),
      listId: 'other-list',
      email: encodeURIComponent('victim@example.com')
    })
    expect(revoke.status).toBe(403)
    expect(language.status).toBe(403)
    expect(memberService.remove).toHaveBeenCalledWith(expect.anything(), 'other-list', 'victim@example.com')
    expect(memberService.updateNotificationLanguage).toHaveBeenCalledWith(
      expect.anything(), 'other-list', 'victim@example.com', { notificationLanguage: 'en' }
    )
  })

  it('returns 403 for a mismatched self-leave without exposing another list', async () => {
    const memberService = service()
    memberService.leave.mockRejectedValue(new ApplicationError('forbidden', 'No access'))
    const response = await createMemberLeaveDeleteHandler({
      authenticatedUserHandler: authenticated(), service: memberService
    })({ request: request('DELETE'), listId: 'unrelated-list' })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: true, message: 'Forbidden' })
  })

  it('does not distinguish a missing list from an inaccessible list', async () => {
    const responses: Response[] = []
    for (const internalMessage of ['List not found', 'User cannot manage this list membership']) {
      const memberService = service()
      memberService.getSummary.mockRejectedValue(new ApplicationError('forbidden', internalMessage))
      responses.push(await createMemberSummaryGetHandler({
        authenticatedUserHandler: authenticated(), service: memberService
      })({ request: request('GET'), listId: 'unknown-list' }))
    }

    expect(responses.map((response) => response.status)).toEqual([403, 403])
    await expect(responses[0].json()).resolves.toEqual({ error: true, message: 'Forbidden' })
    await expect(responses[1].json()).resolves.toEqual({ error: true, message: 'Forbidden' })
  })
})
