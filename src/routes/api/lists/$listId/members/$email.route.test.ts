/** @jest-environment node */

import { getAuthenticatedUserHandler, getMemberCommandService } from '../../../../../modules/composition.server'
import {
  createMemberInviteDeleteHandler,
  createMemberLanguagePatchHandler
} from '../../../../../modules/members/server'
import { memberResourceHandlers } from './$email'

jest.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => options }))
jest.mock('../../../../../modules/composition.server', () => ({
  getAuthenticatedUserHandler: jest.fn(),
  getMemberCommandService: jest.fn()
}))
jest.mock('../../../../../modules/members/server', () => ({
  createMemberInviteDeleteHandler: jest.fn(),
  createMemberLanguagePatchHandler: jest.fn()
}))

describe('member resource production route bindings', () => {
  const authenticatedUserHandler = { handle: jest.fn() }
  const service = { remove: jest.fn(), updateNotificationLanguage: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAuthenticatedUserHandler as jest.Mock).mockReturnValue(authenticatedUserHandler)
    ;(getMemberCommandService as jest.Mock).mockReturnValue(service)
  })

  it.each([
    ['DELETE', createMemberInviteDeleteHandler],
    ['PATCH', createMemberLanguagePatchHandler]
  ] as const)('binds %s to the exact-list member handler', async (method, factory) => {
    const request = new Request('http://localhost/api/lists/list-a/members/guest%40example.com', { method })
    const response = new Response(null, { status: 204 })
    const handler = jest.fn().mockResolvedValue(response)
    ;(factory as jest.Mock).mockReturnValue(handler)

    await expect(memberResourceHandlers[method]({
      request,
      params: { listId: 'list-a', email: 'guest%40example.com' }
    })).resolves.toBe(response)

    expect(factory).toHaveBeenCalledWith({ authenticatedUserHandler, service })
    expect(handler).toHaveBeenCalledWith({
      request,
      listId: 'list-a',
      email: 'guest%40example.com'
    })
  })
})
