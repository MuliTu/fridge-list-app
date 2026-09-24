/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })
jest.mock('../../../src/modules/composition.server', () => ({
  getAuthenticatedUserHandler: jest.fn(),
  getRecordClientEventService: jest.fn()
}))

import { AuthenticatedUserHandler } from '../../../src/modules/identity/server'
import type { RecordClientEventService } from '../../../src/modules/observability'
import { ApplicationError } from '../../../src/modules/shared'
import { createRecordClientEventHandler } from '../../../src/routes/api/client-log'

const request = (body: string, authorization?: string) =>
  new Request('http://localhost/api/client-log', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {})
    },
    body
  })

describe('POST /api/client-log', () => {
  const recordClientEvent = {
    execute: jest.fn()
  } as unknown as jest.Mocked<RecordClientEventService>

  beforeEach(() => jest.clearAllMocks())

  it('returns 401 and never parses or records anonymous content', async () => {
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockRejectedValue(new ApplicationError('unauthenticated', 'Missing bearer token'))
      }
    })

    const response = await createRecordClientEventHandler({
      authenticatedUserHandler,
      recordClientEvent
    })({ request: request('{contains private receipt content') })

    expect(response.status).toBe(401)
    expect(recordClientEvent.execute).not.toHaveBeenCalled()
  })

  it('records one authenticated bounded event and returns 204', async () => {
    const authenticatedUserHandler = new AuthenticatedUserHandler({
      authenticationService: {
        execute: jest.fn().mockResolvedValue({
          kind: 'user',
          uid: 'user-1',
          email: 'user@example.com',
          emailVerified: true
        })
      },
      generateRequestId: () => 'request-1',
      now: () => new Date('2026-08-02T10:00:00.000Z')
    })

    const response = await createRecordClientEventHandler({
      authenticatedUserHandler,
      recordClientEvent
    })({
      request: request(
        JSON.stringify({ name: 'groceries.setBought', level: 'success' }),
        'Bearer token'
      )
    })

    expect(response.status).toBe(204)
    expect(recordClientEvent.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: expect.objectContaining({ uid: 'user-1' }),
        requestId: 'request-1'
      }),
      { name: 'groceries.setBought', level: 'success' }
    )
  })
})
