/** @jest-environment node */

import { getAuthenticatedUserHandler, getMemberCommandService } from '../../../../modules/composition.server'
import {
  createMemberInvitePostHandler,
  createMemberLeaveDeleteHandler,
  createMemberSummaryGetHandler
} from '../../../../modules/members/server'
import { memberCollectionHandlers } from './members'

jest.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }))
jest.mock('../../../../modules/composition.server', () => ({
  getAuthenticatedUserHandler: jest.fn(),
  getMemberCommandService: jest.fn()
}))
jest.mock('../../../../modules/members/server', () => ({
  createMemberInvitePostHandler: jest.fn(),
  createMemberLeaveDeleteHandler: jest.fn(),
  createMemberSummaryGetHandler: jest.fn()
}))

describe('member collection production route bindings', () => {
  const authenticatedUserHandler = { handle: jest.fn() }
  const service = { getSummary: jest.fn(), invite: jest.fn(), leave: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAuthenticatedUserHandler as jest.Mock).mockReturnValue(authenticatedUserHandler)
    ;(getMemberCommandService as jest.Mock).mockReturnValue(service)
  })

  it.each([
    ['GET', createMemberSummaryGetHandler],
    ['POST', createMemberInvitePostHandler],
    ['DELETE', createMemberLeaveDeleteHandler]
  ] as const)('binds %s to the authenticated member handler', async (method, factory) => {
    const request = new Request('http://localhost/api/lists/list-a/members', { method })
    const response = new Response(null, { status: 204 })
    const handler = jest.fn().mockResolvedValue(response)
    ;(factory as jest.Mock).mockReturnValue(handler)

    await expect(memberCollectionHandlers[method]({ request, params: { listId: 'list-a' } }))
      .resolves.toBe(response)

    expect(factory).toHaveBeenCalledWith({ authenticatedUserHandler, service })
    expect(handler).toHaveBeenCalledWith({ request, listId: 'list-a' })
  })
})
