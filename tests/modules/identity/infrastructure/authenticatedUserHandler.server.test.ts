/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import { ApplicationError } from '../../../../src/modules/shared'
import {
  AuthenticatedUserHandler,
  parseJsonRequest,
  USER_REQUEST_ID_HEADER
} from '../../../../src/modules/identity/infrastructure/authenticatedUserHandler.server'

const principal = {
  kind: 'user' as const,
  uid: 'user-1',
  email: 'user@example.com',
  emailVerified: true
}

const createRequest = (body = JSON.stringify({ value: 'safe input' }), requestId?: string) =>
  new Request('http://localhost/api/example', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
      ...(requestId === undefined ? {} : { [USER_REQUEST_ID_HEADER]: requestId })
    },
    body
  })

describe('AuthenticatedUserHandler', () => {
  it('creates a user RequestContext before parsing and executing', async () => {
    const order: string[] = []
    const authenticationService = {
      execute: jest.fn(async () => {
        order.push('authenticate')
        return principal
      })
    }
    const handler = new AuthenticatedUserHandler({
      authenticationService,
      generateRequestId: () => 'generated-id',
      now: () => new Date('2026-08-02T10:00:00.000Z')
    })

    const response = await handler.handle(
      createRequest(undefined, ' caller:123 '),
      async (request) => {
        order.push('parse')
        return request.json() as Promise<{ value: string }>
      },
      (context, input) => {
        order.push('execute')
        expect(context).toEqual({
          principal,
          requestId: 'caller:123',
          now: new Date('2026-08-02T10:00:00.000Z')
        })
        return Response.json(input)
      }
    )

    expect(authenticationService.execute).toHaveBeenCalledWith('Bearer valid-token')
    expect(order).toEqual(['authenticate', 'parse', 'execute'])
    expect(response.status).toBe(200)
  })

  it.each([
    ['missing token', new ApplicationError('unauthenticated', 'Missing bearer token')],
    ['malformed token', new ApplicationError('unauthenticated', 'Missing bearer token')],
    [
      'expired token',
      new ApplicationError('unauthenticated', 'Invalid or expired bearer token', new Error('expired'))
    ]
  ])('returns 401 and performs no parsing or use-case work for a %s', async (_case, error) => {
    const authenticationService = { execute: jest.fn().mockRejectedValue(error) }
    const parseInput = jest.fn()
    const execute = jest.fn()
    const handler = new AuthenticatedUserHandler({ authenticationService })

    const response = await handler.handle(createRequest(), parseInput, execute)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: true, message: 'Unauthorized' })
    expect(parseInput).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('replaces an invalid correlation ID', async () => {
    const handler = new AuthenticatedUserHandler({
      authenticationService: { execute: jest.fn().mockResolvedValue(principal) },
      generateRequestId: () => 'generated-id'
    })

    const response = await handler.handle(
      createRequest(undefined, '../attacker id'),
      parseJsonRequest<{ value: string }>,
      (context) => Response.json({ requestId: context.requestId })
    )

    await expect(response.json()).resolves.toEqual({ requestId: 'generated-id' })
  })

  it('maps malformed JSON only after successful authentication', async () => {
    const authenticationService = { execute: jest.fn().mockResolvedValue(principal) }
    const execute = jest.fn()
    const handler = new AuthenticatedUserHandler({ authenticationService })

    const response = await handler.handle(createRequest('{invalid'), parseJsonRequest, execute)

    expect(authenticationService.execute).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: true, message: 'Invalid request' })
  })
})
